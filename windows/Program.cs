// 바탕화면 치이카와 — Windows 셸.
//
// 아이들은 전부 web\ 안의 HTML·Canvas·JS 다. 이 파일은 mac/Sources/main.swift 와 같은 일을
// 하고, 다리(window.sneaky)도 같은 모양이다:
//   1. 모니터마다 화면을 덮는 투명·클릭 통과·항상 위 오버레이(창 + 웹뷰 + 월드)를 띄운다.
//   2. 지금 떠 있는 **창들의 자리**를 1/30 초마다 한 번 묻고, 모니터마다 나눠 준다.
//   3. 마우스 위치도 같이 넘긴다(아이들이 쳐다본다).
//   4. 전역 핫키 Alt+Shift+K 로 숨기기/보이기, 트레이 메뉴.
//
// 맥과 다른 점:
//   - **작업 표시줄도 「창」으로 넘긴다.** 윈도우에서 최대화한 창은 윗변이 화면 맨 위(0)라
//     설 수가 없다. 최대화해 두고 사는 사람이 많으니, 그때 아이들은 작업 표시줄 위에 선다.
//   - 좌표가 물리 픽셀이다(PerMonitorV2). 웹뷰는 CSS 픽셀이라 모니터 배율로 나눈다.
//   - 투명은 상어·불꽃놀이와 같은 DWM 픽셀 알파다(컬러 키가 아니다 — 그림자·반투명 효과가 많다).
//
// **실제 윈도우에서 아직 돌려 본 적이 없다.** 컴파일은 맥에서 된다(windows/build.sh).

using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Microsoft.Win32;

namespace DesktopChiikawa;

static class Program
{
    [STAThread]
    static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new ChiikawaContext());
    }
}

// ───────────────────────────────────────────── Win32

static class Native
{
    public const int GWL_EXSTYLE = -20;
    public const int WS_EX_TRANSPARENT = 0x00000020;
    public const int WS_EX_TOOLWINDOW = 0x00000080;
    public const int WS_EX_NOACTIVATE = 0x08000000;
    public const int WS_EX_LAYERED = 0x00080000;
    public const uint LWA_ALPHA = 0x00000002;
    public const int WM_HOTKEY = 0x0312;
    public const int MOD_ALT = 0x0001;
    public const int MOD_SHIFT = 0x0004;
    public const int MOD_NOREPEAT = 0x4000;
    public const int VK_K = 0x4B;
    public const int DWMWA_EXTENDED_FRAME_BOUNDS = 9;
    public const int DWMWA_CLOAKED = 14;
    public static readonly IntPtr HWND_TOPMOST = new(-1);
    public const uint SWP_NOACTIVATE = 0x0010;
    public const uint SWP_SHOWWINDOW = 0x0040;

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left, Top, Right, Bottom; }

    [StructLayout(LayoutKind.Sequential)]
    public struct POINT { public int X, Y; }

    [StructLayout(LayoutKind.Sequential)]
    public struct DWM_BLURBEHIND
    {
        public int dwFlags;
        public bool fEnable;
        public IntPtr hRgnBlur;
        public bool fTransitionOnMaximized;
    }

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr param);

    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc proc, IntPtr param);
    [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent, EnumWindowsProc proc, IntPtr param);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder name, int max);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hWnd, int index);
    [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr hWnd, int index, int value);
    [DllImport("user32.dll")] public static extern bool SetLayeredWindowAttributes(IntPtr hWnd, uint key, byte alpha, uint flags);
    [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT point);
    [DllImport("user32.dll")] public static extern bool RegisterHotKey(IntPtr hWnd, int id, int mod, int vk);
    [DllImport("user32.dll")] public static extern bool UnregisterHotKey(IntPtr hWnd, int id);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int w, int h, uint flags);
    [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hWnd, int attr, out RECT value, int size);
    [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hWnd, int attr, out int value, int size);
    [DllImport("dwmapi.dll")] public static extern int DwmEnableBlurBehindWindow(IntPtr hWnd, ref DWM_BLURBEHIND bb);
    [DllImport("gdi32.dll")] public static extern IntPtr CreateRectRgn(int l, int t, int r, int b);
    [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr obj);
}

/// <summary>창 하나. 좌표는 물리 픽셀, 화면 전체 기준.</summary>
readonly record struct WinRect(long Id, Rectangle Rect, bool Dock = false);

/// <summary>떠 있는 창들을 앞에서 뒤 순서로 모은다.</summary>
static class WindowList
{
    private static readonly HashSet<string> SkipClasses = new()
    {
        "Progman", "WorkerW",                         // 바탕화면
        "Shell_TrayWnd", "Shell_SecondaryTrayWnd",    // 작업 표시줄 — 따로 맨 앞에 넣는다
        "Windows.UI.Core.CoreWindow",                 // 시작 메뉴·알림 센터 따위
        "NotifyIconOverflowWindow", "TopLevelWindowForOverflowXamlIsland",
    };

    private const int MinSide = 60;

    public static List<WinRect> Collect()
    {
        var own = (uint)Environment.ProcessId;
        var taskbars = new List<WinRect>();
        var windows = new List<WinRect>();
        var name = new StringBuilder(256);

        // EnumWindows 는 Z 순서(앞 → 뒤)로 준다. 맥의 CGWindowList 와 같은 순서다.
        Native.EnumWindows((hWnd, _) =>
        {
            if (!Native.IsWindowVisible(hWnd) || Native.IsIconic(hWnd)) return true;
            Native.GetWindowThreadProcessId(hWnd, out var pid);
            if (pid == own) return true;

            name.Clear();
            Native.GetClassName(hWnd, name, name.Capacity);
            var cls = name.ToString();

            if (cls is "Shell_TrayWnd" or "Shell_SecondaryTrayWnd")
            {
                // 자동 숨김으로 내려가 있으면 화면에 2px 만 남는다 — 그런 건 안 넣는다.
                if (Native.GetWindowRect(hWnd, out var t) && t.Bottom - t.Top >= 20)
                    taskbars.Add(new WinRect(hWnd.ToInt64(), ToRect(t), Dock: true));
                return true;
            }
            if (SkipClasses.Contains(cls)) return true;

            // 다른 가상 데스크톱에 있거나 숨겨 둔 UWP 창은 「보이는데 안 보이는」 창이다.
            if (Native.DwmGetWindowAttribute(hWnd, Native.DWMWA_CLOAKED, out int cloaked, sizeof(int)) == 0 && cloaked != 0)
                return true;
            if ((Native.GetWindowLong(hWnd, Native.GWL_EXSTYLE) & Native.WS_EX_TOOLWINDOW) != 0) return true;
            // 제목 없는 창은 대개 보이지 않는 도우미 창이다. (제목을 읽지는 않는다 — 길이만 본다.)
            if (Native.GetWindowTextLength(hWnd) == 0) return true;

            // GetWindowRect 는 보이지 않는 그림자 테두리까지 넣어서 아이들이 창 위 7px 허공에 선다.
            // DWM 이 실제로 그리는 테두리를 쓴다.
            if (Native.DwmGetWindowAttribute(hWnd, Native.DWMWA_EXTENDED_FRAME_BOUNDS, out Native.RECT r,
                    Marshal.SizeOf<Native.RECT>()) != 0 && !Native.GetWindowRect(hWnd, out r))
                return true;
            var rect = ToRect(r);
            if (rect.Width < MinSide || rect.Height < MinSide) return true;
            windows.Add(new WinRect(hWnd.ToInt64(), rect));
            return true;
        }, IntPtr.Zero);

        // 작업 표시줄은 늘 맨 위에 있다.
        taskbars.AddRange(windows);
        return taskbars;
    }

    private static Rectangle ToRect(Native.RECT r) => Rectangle.FromLTRB(r.Left, r.Top, r.Right, r.Bottom);
}

// ───────────────────────────────────────────── 설정

sealed class Settings
{
    public int MaxChars { get; set; } = 8;
    public double Scale { get; set; } = 1.2;
    /// <summary>비어 있으면 모든 모니터. 그 밖에는 그 모니터의 장치 이름 하나.</summary>
    public string Screen { get; set; } = "";

    public static readonly string Folder = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "DesktopChiikawa");
    private static readonly string FilePath = Path.Combine(Folder, "settings.json");

    public static Settings Load()
    {
        try
        {
            if (File.Exists(FilePath))
                return JsonSerializer.Deserialize<Settings>(File.ReadAllText(FilePath)) ?? new Settings();
        }
        catch { }
        return new Settings();
    }

    public void Save()
    {
        try
        {
            Directory.CreateDirectory(Folder);
            File.WriteAllText(FilePath, JsonSerializer.Serialize(this));
        }
        catch { }
    }
}

static class Log
{
    private static readonly string LogPath = Path.Combine(Settings.Folder, "debug.log");
    public static readonly bool On = Environment.GetEnvironmentVariable("CHIIKAWA_DEBUG") is not null;

    /// <summary>WinExe 라 콘솔이 없다. CHIIKAWA_DEBUG 가 켜져 있으면 debug.log 로 흘린다.</summary>
    public static void Write(string text)
    {
        if (!On) return;
        try
        {
            Directory.CreateDirectory(Settings.Folder);
            File.AppendAllText(LogPath, $"[chiikawa] {DateTime.Now:HH:mm:ss.fff} {text}{Environment.NewLine}");
        }
        catch { }
    }
}

// ───────────────────────────────────────────── 앱

sealed class ChiikawaContext : ApplicationContext
{
    /// <summary>「크기」 메뉴. 맥 셸의 sizeChoices 와 같은 값이다.</summary>
    private static readonly (string Title, double Value)[] SizeChoices =
    {
        ("아주 작게", 0.6), ("작게", 0.9), ("보통", 1.2), ("크게", 1.6), ("아주 크게", 2.2),
    };

    public static readonly string SpritesFolder = Path.Combine(Settings.Folder, "sprites");
    private static readonly string[] SpriteExtensions = { ".png", ".gif", ".webp" };

    private const string SpritesGuide = """
        여기에 캐릭터 그림을 넣으면 바탕화면 치이카와가 그 그림으로 나옵니다.

        • 파일 이름이 곧 캐릭터 이름입니다. 예) chiikawa.png  hachiware.png  usagi.png
          momonga.png  kurimanju.png  rakko.png  shisa.png  — 이 일곱은 성격(속도·점프·대사)이 정해져 있고,
          그 밖의 이름(예: kani.png)도 넣으면 새 친구로 나옵니다.
        • 배경이 투명한 PNG 가 좋습니다(GIF·WEBP 도 됩니다). 발이 그림 맨 아래에 닿게 잘라 주세요.
        • 그림이 하나라도 있으면 그림이 있는 캐릭터만 나옵니다.
        • 넣은 뒤 트레이 아이콘 → 「그림 다시 불러오기」.
        """;

    private const int HotkeyToggle = 1;

    public readonly Settings Settings = Settings.Load();
    private readonly List<Overlay> overlays = new();
    private readonly NotifyIcon tray = new();
    private readonly HotkeyWindow hotkeys;
    private readonly System.Windows.Forms.Timer poll = new() { Interval = 33 };
    private Task<CoreWebView2Environment>? environment;
    private bool visible = true;

    public ChiikawaContext()
    {
        hotkeys = new HotkeyWindow(id => { if (id == HotkeyToggle) ToggleVisible(); });
        var ok = Native.RegisterHotKey(hotkeys.Handle, HotkeyToggle,
            Native.MOD_ALT | Native.MOD_SHIFT | Native.MOD_NOREPEAT, Native.VK_K);
        // **등록이 성공해도 시스템이 먼저 가로챌 수 있다.** 성공은 검증이 아니다.
        Log.Write($"핫키 Alt+Shift+K 등록 {ok}");

        tray.Icon = LoadIcon();
        tray.Text = "바탕화면 치이카와";
        tray.Visible = true;

        Rebuild();
        RefreshMenu();

        // 모니터를 꽂고 빼거나 해상도·배율·배치를 바꾸면.
        SystemEvents.DisplaySettingsChanged += OnDisplayChanged;

        poll.Tick += (_, _) => Poll();
        poll.Start();
    }

    private void OnDisplayChanged(object? sender, EventArgs e)
    {
        Rebuild();
        RefreshMenu();
    }

    private static Icon LoadIcon()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "icon.ico");
        return File.Exists(path) ? new Icon(path) : SystemIcons.Application;
    }

    /// <summary>웹뷰 환경은 하나를 같이 쓴다. Program Files 에 깔려도 쓸 수 있게 AppData 에.</summary>
    public Task<CoreWebView2Environment> Environment()
    {
        environment ??= CoreWebView2Environment.CreateAsync(null, Path.Combine(Settings.Folder, "webview"));
        return environment;
    }

    public static string[] SpriteFiles()
    {
        try
        {
            if (!Directory.Exists(SpritesFolder)) return Array.Empty<string>();
            return Directory.GetFiles(SpritesFolder)
                .Where(f => SpriteExtensions.Contains(Path.GetExtension(f).ToLowerInvariant()))
                .Select(Path.GetFileName)
                .OfType<string>()
                .OrderBy(f => f, StringComparer.Ordinal)
                .ToArray();
        }
        catch
        {
            return Array.Empty<string>();
        }
    }

    // MARK: 오버레이

    private Screen[] TargetScreens()
    {
        var all = Screen.AllScreens;
        if (Settings.Screen.Length > 0)
        {
            var one = all.FirstOrDefault(s => s.DeviceName == Settings.Screen);
            if (one is not null) return new[] { one };
        }
        // 고른 모니터가 빠졌으면 모든 모니터로 돌아간다.
        return all;
    }

    /// <summary>
    /// 모니터 구성에 맞게 오버레이를 다시 깐다. 그대로인 모니터의 오버레이는 건드리지 않는다 —
    /// 다시 만들면 그 모니터의 아이들이 다 사라졌다 다시 튀어나온다.
    /// </summary>
    private void Rebuild()
    {
        var screens = TargetScreens();
        var wanted = screens.Select(s => s.DeviceName).ToHashSet();
        foreach (var overlay in overlays.Where(o => !wanted.Contains(o.DeviceName)).ToList())
        {
            overlay.Close();
            overlays.Remove(overlay);
        }
        foreach (var screen in screens)
        {
            var existing = overlays.FirstOrDefault(o => o.DeviceName == screen.DeviceName);
            if (existing is not null)
            {
                existing.Place(screen.Bounds);
                continue;
            }
            var overlay = new Overlay(this, screen);
            overlays.Add(overlay);
            if (visible) overlay.Show();
        }
        Log.Write($"오버레이 {overlays.Count} 장");
    }

    /// <summary>창 목록을 한 번만 묻고 모니터마다 나눠 준다.</summary>
    public void Poll()
    {
        if (!visible || !overlays.Any(o => o.Ready)) return;
        var windows = WindowList.Collect();
        Point? mouse = Native.GetCursorPos(out var p) ? new Point(p.X, p.Y) : null;
        foreach (var overlay in overlays) overlay.SendWindows(windows, mouse);
    }

    /// <summary>맥 셸과 <b>같은 모양</b>의 다리. 값은 직렬화에 맡긴다(손으로 따옴표를 붙이지 않는다).</summary>
    public string BridgeScript() => $$"""
        window.sneaky = {
          maxChars: {{Settings.MaxChars}},
          scale: {{JsonSerializer.Serialize(Settings.Scale)}},
          debug: {{(Log.On ? "true" : "false")}},
          onScale: (handler) => { window.__ckScale = handler },
          sprites: {{JsonSerializer.Serialize(SpriteFiles())}},
          onWindows: (handler) => { window.__ckWindows = (data) => handler(data.w, data.m) },
          onMaxChars: (handler) => { window.__ckMaxChars = handler },
          send: (message) => window.chrome.webview.postMessage(message),
        }
        window.addEventListener('error', (e) => window.chrome.webview.postMessage({
          type: 'log', text: `${e.message} (${e.filename}:${e.lineno})`,
        }))
        console.error = (...args) => window.chrome.webview.postMessage({
          type: 'log', text: args.join(' '),
        })
        """;

    // MARK: 트레이 메뉴

    private void RefreshMenu()
    {
        var menu = new ContextMenuStrip();
        menu.Items.Add(new ToolStripMenuItem("숨기기 / 보이기  Alt+Shift+K", null, (_, _) => ToggleVisible()));
        menu.Items.Add(new ToolStripSeparator());

        var count = new ToolStripMenuItem(overlays.Count > 1 ? "몇 마리까지 (모니터마다)" : "몇 마리까지");
        foreach (var n in new[] { 1, 2, 4, 8, 12 })
        {
            count.DropDownItems.Add(new ToolStripMenuItem($"{n} 마리", null, (_, _) => SetMaxChars(n))
            {
                Checked = Settings.MaxChars == n,
            });
        }
        menu.Items.Add(count);

        var size = new ToolStripMenuItem("크기");
        foreach (var (title, value) in SizeChoices)
        {
            size.DropDownItems.Add(new ToolStripMenuItem(title, null, (_, _) => SetScale(value))
            {
                Checked = Math.Abs(Settings.Scale - value) < 0.001,
            });
        }
        menu.Items.Add(size);

        if (Screen.AllScreens.Length > 1) menu.Items.Add(ScreenMenu());
        menu.Items.Add(new ToolStripSeparator());

        var sprites = SpriteFiles().Length;
        menu.Items.Add(new ToolStripMenuItem(
            sprites > 0 ? $"캐릭터 그림 폴더 열기… ({sprites}장)" : "캐릭터 그림 폴더 열기…",
            null, (_, _) => OpenSpritesFolder()));
        menu.Items.Add(new ToolStripMenuItem("그림 다시 불러오기", null, (_, _) => ReloadSprites()));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(new ToolStripMenuItem("종료", null, (_, _) => Quit()));

        var old = tray.ContextMenuStrip;
        tray.ContextMenuStrip = menu;
        old?.Dispose();
    }

    private ToolStripMenuItem ScreenMenu()
    {
        var root = new ToolStripMenuItem("모니터");
        root.DropDownItems.Add(new ToolStripMenuItem("모든 모니터", null, (_, _) => SetScreen(""))
        {
            Checked = Settings.Screen.Length == 0 || overlays.Count > 1,
        });
        root.DropDownItems.Add(new ToolStripSeparator());
        var screens = Screen.AllScreens;
        for (var i = 0; i < screens.Length; i += 1)
        {
            var screen = screens[i];
            var main = screen.Primary ? " (주 화면)" : "";
            var name = screen.DeviceName;
            root.DropDownItems.Add(new ToolStripMenuItem(
                $"{i + 1}번만  {screen.Bounds.Width}×{screen.Bounds.Height}{main}", null, (_, _) => SetScreen(name))
            {
                Checked = overlays.Count == 1 && Settings.Screen == name,
            });
        }
        return root;
    }

    private void SetMaxChars(int n)
    {
        Settings.MaxChars = n;
        Settings.Save();
        foreach (var o in overlays) o.Eval($"window.__ckMaxChars && window.__ckMaxChars({n})");
        RefreshMenu();
    }

    private void SetScale(double value)
    {
        Settings.Scale = value;
        Settings.Save();
        foreach (var o in overlays) o.Eval($"window.__ckScale && window.__ckScale({JsonSerializer.Serialize(value)})");
        RefreshMenu();
    }

    private void SetScreen(string name)
    {
        Settings.Screen = name;
        Settings.Save();
        Rebuild();
        RefreshMenu();
    }

    private static void OpenSpritesFolder()
    {
        try
        {
            Directory.CreateDirectory(SpritesFolder);
            var guide = Path.Combine(SpritesFolder, "읽어 주세요.txt");
            if (!File.Exists(guide)) File.WriteAllText(guide, SpritesGuide, Encoding.UTF8);
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(SpritesFolder) { UseShellExecute = true });
        }
        catch (Exception e)
        {
            Log.Write($"그림 폴더를 못 열었다: {e.Message}");
        }
    }

    private void ReloadSprites()
    {
        foreach (var o in overlays) _ = o.ReloadAsync();
        RefreshMenu();
    }

    public void ToggleVisible()
    {
        visible = !visible;
        foreach (var o in overlays)
        {
            if (visible) o.Show();
            else o.Hide();
        }
        if (visible) Poll();
    }

    private void Quit()
    {
        poll.Stop();
        Native.UnregisterHotKey(hotkeys.Handle, HotkeyToggle);
        SystemEvents.DisplaySettingsChanged -= OnDisplayChanged;
        tray.Visible = false;
        foreach (var o in overlays) o.Close();
        hotkeys.DestroyHandle();
        ExitThread();
    }
}

/// <summary>핫키만 받는 보이지 않는 창. 오버레이는 모니터 따라 생겼다 없어지므로 거기 걸지 않는다.</summary>
sealed class HotkeyWindow : NativeWindow
{
    private readonly Action<int> pressed;

    public HotkeyWindow(Action<int> pressed)
    {
        this.pressed = pressed;
        CreateHandle(new CreateParams());
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == Native.WM_HOTKEY) pressed((int)m.WParam);
        base.WndProc(ref m);
    }
}

// ───────────────────────────────────────────── 오버레이 한 장 (모니터 하나)

sealed class Overlay : Form
{
    private const string Host = "https://chiikawa.local/";

    private static readonly Dictionary<string, string> Mime = new()
    {
        [".html"] = "text/html; charset=utf-8", [".js"] = "text/javascript; charset=utf-8",
        [".css"] = "text/css; charset=utf-8", [".json"] = "application/json", [".png"] = "image/png",
        [".gif"] = "image/gif", [".webp"] = "image/webp", [".jpg"] = "image/jpeg", [".jpeg"] = "image/jpeg",
    };

    private readonly ChiikawaContext app;
    private readonly WebView2 web = new();
    private string? bridgeId;
    private string lastPayload = "";
    private Rectangle screenBounds;

    public string DeviceName { get; }
    public bool Ready { get; private set; }

    public Overlay(ChiikawaContext app, Screen screen)
    {
        this.app = app;
        DeviceName = screen.DeviceName;
        screenBounds = screen.Bounds;

        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.Manual;
        // 배율을 WinForms 가 알아서 바꾸면 모니터 경계에서 크기가 어긋난다. 크기는 우리가 정한다.
        AutoScaleMode = AutoScaleMode.None;
        Bounds = screen.Bounds;
        // DWM 합성에 맡길 때는 폼이 스스로 배경을 칠하면 안 된다. 검정은 알파 0 과 함께
        // 「아무것도 없음」으로 합성된다.
        BackColor = Color.Black;

        web.Dock = DockStyle.Fill;
        web.DefaultBackgroundColor = Color.Transparent;
        Controls.Add(web);

        _ = InitAsync();
    }

    /// <summary>모니터 자리(물리 픽셀)에 맞춘다. 해상도·배치가 바뀌었을 때도.</summary>
    public void Place(Rectangle bounds)
    {
        screenBounds = bounds;
        lastPayload = "";
        if (IsHandleCreated)
        {
            Native.SetWindowPos(Handle, Native.HWND_TOPMOST, bounds.X, bounds.Y, bounds.Width, bounds.Height,
                Native.SWP_NOACTIVATE | (Visible ? Native.SWP_SHOWWINDOW : 0));
        }
        else
        {
            Bounds = bounds;
        }
    }

    // MARK: 투명과 클릭 — 상어 셸과 같은 길이다. 자세한 까닭은 desktop-shark/windows/Program.cs.

    protected override CreateParams CreateParams
    {
        get
        {
            var p = base.CreateParams;
            p.ExStyle |= Native.WS_EX_TRANSPARENT | Native.WS_EX_TOOLWINDOW | Native.WS_EX_NOACTIVATE;
            if (Layered) p.ExStyle |= Native.WS_EX_LAYERED;
            return p;
        }
    }

    /// <summary>CHIIKAWA_LAYERED=1 이면 레이어드 창으로. 클릭이 안 통과하는 기계를 위한 마지막 수단.</summary>
    private static bool Layered => System.Environment.GetEnvironmentVariable("CHIIKAWA_LAYERED") == "1";

    protected override bool ShowWithoutActivation => true;

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        if (Layered) Native.SetLayeredWindowAttributes(Handle, 0, 255, Native.LWA_ALPHA);
        // 빈 영역으로 블러를 켠다 — 흐림은 없고 픽셀 단위 알파만 얻는다.
        var region = Native.CreateRectRgn(0, 0, -1, -1);
        try
        {
            var bb = new Native.DWM_BLURBEHIND { dwFlags = 0x1 | 0x2, fEnable = true, hRgnBlur = region };
            var hr = Native.DwmEnableBlurBehindWindow(Handle, ref bb);
            Log.Write($"{DeviceName} DwmEnableBlurBehindWindow hr={hr}");
        }
        finally
        {
            Native.DeleteObject(region);
        }
        // PerMonitorV2 에서 다른 배율의 모니터로 옮기면 WinForms 가 크기를 다시 매길 수 있다.
        // 창이 생긴 뒤 물리 픽셀로 한 번 더 못 박는다.
        Place(screenBounds);
    }

    /// <summary>
    /// 창과 <b>모든 자식 창</b>에 WS_EX_TRANSPARENT 를 건다. WebView2 는 자식 창을 늦게
    /// 만들고, 그 자식이 클릭을 삼키면 이 모니터 전체가 먹통이 된다.
    /// </summary>
    private void ApplyClickThrough()
    {
        Touch(Handle);
        Native.EnumChildWindows(Handle, (child, _) => { Touch(child); return true; }, IntPtr.Zero);

        static void Touch(IntPtr hWnd)
        {
            var style = Native.GetWindowLong(hWnd, Native.GWL_EXSTYLE);
            Native.SetWindowLong(hWnd, Native.GWL_EXSTYLE, style | Native.WS_EX_TRANSPARENT);
        }
    }

    // MARK: 웹뷰

    private async Task InitAsync()
    {
        try
        {
            var env = await app.Environment();
            await web.EnsureCoreWebView2Async(env);
            var core = web.CoreWebView2;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.WebMessageReceived += OnMessage;

            // 맥 셸의 커스텀 스킴에 해당하는 것. 파일을 직접 내준다 — /sprites/… 는 앱 폴더가
            // 아니라 그림 폴더에서. 같은 출처라 그림 여백 자르기(getImageData)도 막히지 않는다.
            core.AddWebResourceRequestedFilter(Host + "*", CoreWebView2WebResourceContext.All);
            core.WebResourceRequested += (_, e) => e.Response = Serve(env, e.Request.Uri);

            bridgeId = await core.AddScriptToExecuteOnDocumentCreatedAsync(app.BridgeScript());
            core.NavigationCompleted += (_, _) => ApplyClickThrough();
            core.Navigate(Host + "renderer/index.html");
            ApplyClickThrough();
        }
        catch (Exception e)
        {
            // 웹뷰 런타임이 없는 PC 가 있다(오래된 윈도우 10). 조용히 죽지 말고 남긴다.
            Log.Write($"{DeviceName} 웹뷰를 못 띄웠다: {e.Message}");
        }
    }

    private static CoreWebView2WebResourceResponse Serve(CoreWebView2Environment env, string uri)
    {
        var path = Uri.TryCreate(uri, UriKind.Absolute, out var u) ? Uri.UnescapeDataString(u.AbsolutePath) : "/";
        if (path == "/") path = "/renderer/index.html";

        string root;
        string relative;
        if (path.StartsWith("/sprites/", StringComparison.Ordinal))
        {
            root = ChiikawaContext.SpritesFolder;
            relative = path["/sprites/".Length..];
        }
        else
        {
            root = Path.Combine(AppContext.BaseDirectory, "web");
            relative = path.TrimStart('/');
        }

        var full = Path.GetFullPath(Path.Combine(root, relative.Replace('/', Path.DirectorySeparatorChar)));
        // 그 폴더 밖으로 나가는 경로는 거절한다.
        if (!full.StartsWith(Path.GetFullPath(root), StringComparison.OrdinalIgnoreCase) || !File.Exists(full))
            return env.CreateWebResourceResponse(null, 404, "Not Found", "");

        var mime = Mime.GetValueOrDefault(Path.GetExtension(full).ToLowerInvariant(), "application/octet-stream");
        var stream = new MemoryStream(File.ReadAllBytes(full));
        return env.CreateWebResourceResponse(stream, 200, "OK", $"Content-Type: {mime}\r\nCache-Control: no-cache");
    }

    public void Eval(string script)
    {
        if (Ready) _ = web.ExecuteScriptAsync(script);
    }

    /// <summary>그림 목록이 바뀌었다 — 다리 스크립트를 갈아 끼우고 다시 연다.</summary>
    public async Task ReloadAsync()
    {
        if (web.CoreWebView2 is null) return;
        if (bridgeId is not null) web.CoreWebView2.RemoveScriptToExecuteOnDocumentCreated(bridgeId);
        bridgeId = await web.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(app.BridgeScript());
        Ready = false;
        web.CoreWebView2.Reload();
    }

    /// <summary>
    /// 창 목록(물리 픽셀, 화면 전체 기준)을 이 모니터의 CSS 픽셀로 옮겨 보낸다.
    /// 이 모니터에 안 걸친 창은 뺀다.
    /// </summary>
    public void SendWindows(List<WinRect> windows, Point? mouse)
    {
        if (!Ready || !Visible) return;
        var scale = DeviceDpi / 96.0;
        var b = screenBounds;

        var rows = new List<long[]>();
        foreach (var (id, r, dock) in windows)
        {
            if (!r.IntersectsWith(b)) continue;
            var x = (long)Math.Round((r.X - b.X) / scale);
            var y = (long)Math.Round((r.Y - b.Y) / scale);
            var w = (long)Math.Round(r.Width / scale);
            var h = (long)Math.Round(r.Height / scale);
            // 여섯째 칸 1 = 작업 표시줄. 낮아도 설 수 있다(렌더러 standable).
            rows.Add(dock ? new[] { id, x, y, w, h, 1L } : new[] { id, x, y, w, h });
        }
        // 마우스가 다른 모니터에 있으면 이 모니터의 아이들은 쳐다볼 게 없다.
        long[]? m = mouse is { } p && b.Contains(p)
            ? new[] { (long)Math.Round((p.X - b.X) / scale), (long)Math.Round((p.Y - b.Y) / scale) }
            : null;

        var json = JsonSerializer.Serialize(new { w = rows, m });
        if (json == lastPayload) return;
        lastPayload = json;
        _ = web.ExecuteScriptAsync($"window.__ckWindows && window.__ckWindows({json})");
    }

    private void OnMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            using var doc = JsonDocument.Parse(e.WebMessageAsJson);
            var root = doc.RootElement;
            var type = root.TryGetProperty("type", out var t) ? t.GetString() : null;
            switch (type)
            {
                case "ready":
                    Ready = true;
                    lastPayload = "";
                    ApplyClickThrough();
                    app.Poll();
                    break;
                case "log":
                    Log.Write($"[web {DeviceName}] {(root.TryGetProperty("text", out var text) ? text.GetString() : "")}");
                    break;
            }
        }
        catch { }
    }

    protected override void OnDpiChanged(DpiChangedEventArgs e)
    {
        // 배율을 바꾸면 WinForms 가 제안하는 크기가 아니라 모니터 크기 그대로 둔다.
        e.Cancel = true;
        lastPayload = "";
        Place(screenBounds);
    }
}
