// 바탕화면 치이카와 — macOS 셸.
//
// 아이들은 전부 web/ 안의 HTML·Canvas·JS 다. 이 파일이 하는 일:
//   1. 화면을 덮는 투명·클릭 통과·항상 위 오버레이를 띄운다.
//   2. 지금 화면에 떠 있는 **창들의 자리**를 1/30 초마다 물어 웹뷰에 넘긴다.
//   3. 마우스 위치도 같이 넘긴다(아이들이 쳐다본다).
//   4. 전역 핫키 ⌥⇧K 로 숨기기/보이기, 메뉴바 메뉴.
//
// **모니터마다 오버레이(창+웹뷰+월드)가 하나씩** 있다. 창 목록은 한 번만 묻고 나눠 준다.
//
// 창 자리는 CGWindowListCopyWindowInfo 로 묻는다. **화면 기록 권한이 필요 없다** —
// 권한이 막는 것은 창 제목(kCGWindowName)과 창 내용이고, 위치·크기·층·주인 PID 는
// 누구나 볼 수 있다. 제목을 읽으려 들면 그 순간부터 권한 창이 뜬다. 읽지 말 것.

import AppKit
import Carbon.HIToolbox
import WebKit

// MARK: - 상수

private enum Key {
    /// ⌥⇧K — 숨기기 / 보이기. (⌥⇧H 는 불꽃놀이·상어가 이미 쓴다. 같은 조합을 두 앱이
    /// 등록하면 한쪽은 조용히 안 받는다.)
    static let toggle = (code: UInt32(kVK_ANSI_K), modifiers: UInt32(optionKey | shiftKey))
}

private let screenKey = "screenNumber"
private let maxCharsKey = "maxChars"
private let scaleKey = "scale"
private let webScheme = "chiikawa"
private let hotKeySignature = OSType(0x43484957) // 'CHIW'
private let toggleHotKeyID: UInt32 = 0

/// 창 자리를 묻는 간격. 창을 끌 때 아이들이 창을 따라가는 매끄러움이 이걸로 정해진다.
private let pollInterval: TimeInterval = 1.0 / 30.0

/// 이보다 작은 창은 보내지도 않는다(렌더러도 한 번 더 거른다).
private let minWindowSide: CGFloat = 60

/// 「크기」 메뉴. 윈도우 셸의 SizeChoices 와 같은 값이다 — 한쪽만 바꾸면 두 플랫폼이 다른 앱이 된다.
private let sizeChoices: [(String, Double)] = [
    ("아주 작게", 0.6), ("작게", 0.9), ("보통", 1.2), ("크게", 1.6), ("아주 크게", 2.2),
]

/// 새 버전이 있는지 물어보는 곳. 태그를 밀면 CI 가 여기에 릴리스를 올린다.
private let releaseAPI = "https://api.github.com/repos/joowon-dev/desktop-chiikawa/releases/latest"
private let releasePage = "https://joowonkoh.com/playground/desktop-chiikawa"
/// 자동 업데이트가 받아 가는 것은 zip 이다 — dmg 를 마운트해 자기를 갈아 끼우면 실패할 자리가 너무 많다.
private let macAssetSuffix = "-mac.zip"
private let updateCheckInterval: TimeInterval = 24 * 60 * 60
private let firstUpdateCheckDelay: TimeInterval = 20

/// "v1.2.0" > "1.10.0" 같은 걸 숫자로 비교한다. 문자열로 비교하면 1.10 이 1.9 보다 작다.
func isNewerVersion(_ candidate: String, than current: String) -> Bool {
    func parts(_ text: String) -> [Int] {
        text.trimmingCharacters(in: CharacterSet(charactersIn: "vV "))
            .split(separator: ".").map { Int($0.prefix(while: \.isNumber)) ?? 0 }
    }
    let a = parts(candidate), b = parts(current)
    for i in 0..<max(a.count, b.count) {
        let x = i < a.count ? a[i] : 0
        let y = i < b.count ? b[i] : 0
        if x != y { return x > y }
    }
    return false
}

func debugLog(_ text: String) {
    guard ProcessInfo.processInfo.environment["CHIIKAWA_DEBUG"] != nil else { return }
    FileHandle.standardError.write("[chiikawa] \(text)\n".data(using: .utf8)!)
}

// MARK: - 그림 폴더

/// 캐릭터 그림을 넣는 폴더. ~/Library/Application Support/DesktopChiikawa/sprites
/// 앱 번들에는 그림을 싣지 않는다 — 주인이 자기 컴퓨터에 넣은 그림만 쓴다.
let spritesDirectory: URL = {
    let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    return support.appendingPathComponent("DesktopChiikawa/sprites", isDirectory: true)
}()

private let spriteExtensions: Set<String> = ["png", "gif", "webp"]

/// 친구 코드로 주인의 그림을 받아 오는 곳(Supabase Edge Function). 코드가 맞으면 비공개 버킷의
/// 그림을 받을 10분짜리 주소를 준다. 서버 쪽은 supabase/functions/chiikawa-sprites.
/// 확인할 때만 CHIIKAWA_FRIEND_URL 로 바꾼다(닿지 않는 주소로 「인터넷 없음」을 재현한다).
private let friendSpritesURL = URL(string: ProcessInfo.processInfo.environment["CHIIKAWA_FRIEND_URL"]
    ?? "https://xajmblrdkdnqoxfvsfrt.supabase.co/functions/v1/chiikawa-sprites")!
private let friendCodeKey = "friendCode"
/// 코드를 안 넣어도 쓰는 기본 코드. 그래서 처음 켤 때부터 주인의 그림으로 나온다(v1.1.0, 주인 요청).
/// 앱에 들어 있어 사실상 공개다 — DB 에서 이 줄만 꺼도(enabled=false) 앱은 조용히 도형으로 돈다.
private let builtInFriendCode = "CHII-APP"
/// 처음 켤 때 그림을 이만큼 기다리고, 그래도 안 오면 도형으로 띄운다(나중에 오면 갈아 입힌다).
private let firstSpritesWait: TimeInterval = 8
/// 친구 코드로 받은 파일 이름들. 코드를 지울 때 이것만 지운다(직접 넣은 그림은 남긴다).
private let friendFilesKey = "friendFiles"

/// 폴더 안의 그림 파일 이름들(이름순).
func spriteFiles() -> [String] {
    let names = (try? FileManager.default.contentsOfDirectory(atPath: spritesDirectory.path)) ?? []
    return names.filter { spriteExtensions.contains(($0 as NSString).pathExtension.lowercased()) }.sorted()
}

private let spritesGuide = """
여기에 캐릭터 그림을 넣으면 바탕화면 치이카와가 그 그림으로 나옵니다.

• 파일 이름이 곧 캐릭터 이름입니다. 예) chiikawa.png  hachiware.png  usagi.png
  momonga.png  kurimanju.png  rakko.png  shisa.png  — 이 일곱은 성격(속도·점프·대사)이 정해져 있고,
  그 밖의 이름(예: kani.png, furuhonya.png)도 넣으면 새 친구로 나옵니다.
• 배경이 투명한 PNG 가 좋습니다(GIF·WEBP 도 됩니다). 발이 그림 맨 아래에 닿게 잘라 주세요.
• 그림이 하나라도 있으면 그림이 있는 캐릭터만 나옵니다.
• 넣은 뒤 메뉴바 아이콘 → 「그림 다시 불러오기」.
"""

// MARK: - 번들 안의 웹 파일을 넘겨주는 핸들러

/// file:// 로 열면 ES 모듈 import 가 막힌다. 커스텀 스킴으로 번들 Resources/web 을 내준다.
/// /sprites/… 는 번들이 아니라 그림 폴더(spritesDirectory)에서 내준다.
final class WebAssetHandler: NSObject, WKURLSchemeHandler {
    private let root: URL

    init(root: URL) {
        self.root = root
    }

    private static let mimeTypes = [
        "html": "text/html", "js": "text/javascript", "css": "text/css",
        "json": "application/json", "png": "image/png", "gif": "image/gif",
        "webp": "image/webp", "jpg": "image/jpeg", "jpeg": "image/jpeg",
    ]

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        let relative = url.path.isEmpty || url.path == "/" ? "/renderer/index.html" : url.path
        var base = root
        var path = relative
        if relative.hasPrefix("/sprites/") {
            base = spritesDirectory
            path = String(relative.dropFirst("/sprites".count))
        }
        let file = base.appendingPathComponent(path).standardized

        // 그 폴더 밖으로 나가는 경로는 거절한다.
        guard file.path.hasPrefix(base.standardized.path), let data = try? Data(contentsOf: file) else {
            task.didFailWithError(URLError(.fileDoesNotExist))
            return
        }

        let mime = Self.mimeTypes[file.pathExtension.lowercased()] ?? "application/octet-stream"
        let response = URLResponse(url: url, mimeType: mime,
                                   expectedContentLength: data.count, textEncodingName: "utf-8")
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

// MARK: - 오버레이 한 장 (모니터 하나)

/// WKUserContentController 는 핸들러를 강하게 붙든다. 오버레이를 버릴 때 같이 놓이도록
/// 약한 다리를 하나 끼운다 — 모니터를 뺐다 꽂을 때마다 웹뷰가 새는 일을 막는다.
final class WeakHandler: NSObject, WKScriptMessageHandler {
    weak var target: Overlay?
    init(_ target: Overlay) { self.target = target }
    func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.received(message)
    }
}

/// 모니터 하나를 덮는 투명 창 + 웹뷰. **월드도 모니터마다 따로 돈다** — 모니터마다
/// 좌표 원점과 배율이 달라서, 한 웹뷰로 여러 모니터를 덮을 수가 없다(맥은 「디스플레이마다
/// 별도의 Spaces」가 기본이라 창 하나가 두 모니터에 걸쳐 그려지지도 않는다).
final class Overlay {
    let screenNumber: Int
    let window: NSWindow
    let webView: WKWebView
    private(set) var ready = false
    private var lastPayload = ""

    init(screen: NSScreen, bridge: String) {
        screenNumber = App.number(of: screen)
        // 메뉴바까지 덮는다 — 최대화한 창 윗변에 선 아이는 메뉴바 자리에 서 있게 된다.
        window = NSWindow(contentRect: screen.frame, styleMask: .borderless, backing: .buffered, defer: false)
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = false
        window.ignoresMouseEvents = true
        // 메뉴바(24) 바로 위, 펼친 메뉴(101) 아래. screenSaver 로 올리면 펼친 메뉴 위에도
        // 아이들이 그려져서 메뉴 항목을 가린다.
        window.level = .statusBar
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        window.isReleasedWhenClosed = false

        let config = WKWebViewConfiguration()
        let web = Bundle.main.resourceURL!.appendingPathComponent("web")
        config.setURLSchemeHandler(WebAssetHandler(root: web), forURLScheme: webScheme)
        config.userContentController.addUserScript(
            WKUserScript(source: bridge, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        )
        webView = WKWebView(frame: window.contentView!.bounds, configuration: config)
        webView.autoresizingMask = [.width, .height]
        webView.setValue(false, forKey: "drawsBackground")
        config.userContentController.add(WeakHandler(self), name: "chiikawa")
        webView.load(URLRequest(url: URL(string: "\(webScheme)://app/renderer/index.html")!))

        window.contentView?.addSubview(webView)
        window.setFrame(screen.frame, display: true)
        window.orderFrontRegardless() // 포커스는 절대 가져가지 않는다
    }

    func close() {
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "chiikawa")
        window.orderOut(nil)
        window.close()
    }

    func eval(_ script: String) {
        webView.evaluateJavaScript(script)
    }

    /// 그림 목록이 바뀌었다 — 다리 스크립트를 갈아 끼우고 다시 연다.
    func reload(bridge: String) {
        let controller = webView.configuration.userContentController
        controller.removeAllUserScripts()
        controller.addUserScript(WKUserScript(source: bridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        ready = false
        webView.reload()
    }

    /// 창 목록(전역 CG 좌표)을 이 모니터 좌표로 옮겨 보낸다. 이 모니터에 안 걸친 창은 뺀다.
    func send(windows: [(id: Int, rect: CGRect)], mouse: NSPoint) {
        guard ready, window.isVisible else { return }
        let frame = window.frame
        // CG 좌표는 주 화면 왼쪽 위가 원점이고 아래로 갈수록 y 가 커진다. 코코아는 반대다.
        let originX = frame.minX
        let originY = App.primaryScreen.frame.height - frame.maxY
        let bounds = CGRect(origin: .zero, size: frame.size)

        var rows: [[Int]] = []
        for (id, rect) in windows {
            let local = rect.offsetBy(dx: -originX, dy: -originY)
            guard local.intersects(bounds) else { continue }
            rows.append([id, Int(local.minX.rounded()), Int(local.minY.rounded()),
                         Int(local.width.rounded()), Int(local.height.rounded())])
        }
        // 마우스가 다른 모니터에 있으면 이 모니터의 아이들은 쳐다볼 게 없다.
        let m: Any = frame.contains(mouse)
            ? [Int((mouse.x - frame.minX).rounded()), Int((frame.maxY - mouse.y).rounded())]
            : NSNull()

        let payload: [String: Any] = ["w": rows, "m": m]
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        if json == lastPayload { return }
        lastPayload = json
        webView.evaluateJavaScript("window.__ckWindows && window.__ckWindows(\(json))")
    }

    func received(_ message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        switch type {
        case "ready":
            ready = true
            lastPayload = ""
            App.shared?.poll()
        case "log":
            if let text = body["text"] as? String {
                FileHandle.standardError.write("[web \(screenNumber)] \(text)\n".data(using: .utf8)!)
            }
        default:
            break
        }
    }
}

// MARK: - 앱

final class App: NSObject, NSApplicationDelegate {
    private var overlays: [Overlay] = []
    private var visible = true
    private var statusItem: NSStatusItem!
    private var hotKeys: [EventHotKeyRef?] = []
    private var pollTimer: Timer?
    private var updateVersion: String?
    private var updateAsset: URL?
    private var updateNote: String?
    private var updating = false

    private var maxChars: Int {
        get {
            let saved = UserDefaults.standard.integer(forKey: maxCharsKey)
            return saved > 0 ? saved : 8
        }
        set {
            UserDefaults.standard.set(newValue, forKey: maxCharsKey)
            overlays.forEach { $0.eval("window.__ckMaxChars && window.__ckMaxChars(\(newValue))") }
            refreshMenu()
        }
    }

    /// 그리는 크기 배율. 안 정했으면 1.2 — 큰 화면에서 1 은 좀 작다.
    private var scale: Double {
        get {
            let saved = UserDefaults.standard.double(forKey: scaleKey)
            return saved > 0 ? saved : 1.2
        }
        set {
            UserDefaults.standard.set(newValue, forKey: scaleKey)
            overlays.forEach { $0.eval("window.__ckScale && window.__ckScale(\(newValue))") }
            refreshMenu()
        }
    }

    /// 어느 모니터에 사나. 0(기본) = 모든 모니터, 그 밖에는 그 모니터 번호 하나.
    private var chosenScreenNumber: Int {
        get { UserDefaults.standard.integer(forKey: screenKey) }
        set { UserDefaults.standard.set(newValue, forKey: screenKey) }
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        installEditMenu()
        // 그림이 하나도 없으면(처음 켤 때) 받아 올 때까지 친구들을 띄우지 않는다 — 도형이 먼저 나왔다가
        // 그림으로 바뀌지 않게. 너무 오래 걸리면 도형으로 먼저 띄운다.
        if spriteFiles().isEmpty {
            waitingForSprites = true
            DispatchQueue.main.asyncAfter(deadline: .now() + firstSpritesWait) { [weak self] in
                self?.stopWaitingForSprites()
            }
        }
        rebuildOverlays()
        buildStatusItem()
        registerHotKeys()

        // 모니터를 꽂고 빼거나 해상도·배치를 바꾸면 오버레이를 새로 깐다.
        NotificationCenter.default.addObserver(
            forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main
        ) { [weak self] _ in
            self?.rebuildOverlays()
            self?.refreshMenu()
        }

        let timer = Timer(timeInterval: pollInterval, repeats: true) { [weak self] _ in self?.poll() }
        // 메뉴를 열어 둔 동안에도(트래킹 런루프 모드) 계속 돈다.
        RunLoop.main.add(timer, forMode: .common)
        pollTimer = timer

        scheduleUpdateChecks()

        // 켤 때마다 주인의 최신 그림을 받아 온다. 넣어 둔 코드가 없으면 기본 코드로.
        // CHIIKAWA_FRIEND_CODE 는 확인용 — 입력 창 없이 그 코드로 받아 본다.
        syncFriendSprites(code: ProcessInfo.processInfo.environment["CHIIKAWA_FRIEND_CODE"] ?? activeFriendCode,
                          interactive: false)
    }

    /// 처음 켤 때 그림을 기다리는 중인가. 그동안은 오버레이를 만들지 않는다.
    private var waitingForSprites = false

    private func stopWaitingForSprites() {
        guard waitingForSprites else { return }
        waitingForSprites = false
        rebuildOverlays()
    }

    // MARK: 친구 코드
    //
    // 주인이 올린 그림을 **코드를 아는 앱만** 받는다. 그림은 비공개 버킷에 있고, 코드가 맞으면
    // Edge Function 이 임시 주소를 준다. 받은 그림은 그림 폴더에 넣고 다시 불러온다 — 그러니
    // 한 번 받은 뒤에는 인터넷이 끊겨도 그 그림으로 산다. 다만 받아 오는 순간 인터넷이 없으면
    // 「인터넷 연결이 필요해요」를 띄운다.

    /// 사람이 직접 넣은 코드. 기본 코드는 여기 저장하지 않는다.
    private var friendCode: String? {
        get { UserDefaults.standard.string(forKey: friendCodeKey) }
        set { UserDefaults.standard.set(newValue, forKey: friendCodeKey) }
    }

    private var activeFriendCode: String { friendCode ?? builtInFriendCode }

    @objc private func enterFriendCode() {
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "친구 코드 입력"
        alert.informativeText = "받은 친구 코드를 넣으면 그 그림으로 친구들이 나와요."
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 240, height: 24))
        field.placeholderString = "예: CHII77"
        // 친구가 코드를 복사해 둔 채로 열면 미리 채워 둔다.
        if let copied = NSPasteboard.general.string(forType: .string)?
            .trimmingCharacters(in: .whitespacesAndNewlines), Self.looksLikeCode(copied) {
            field.stringValue = copied
        }
        alert.accessoryView = field
        alert.addButton(withTitle: "받기")
        alert.addButton(withTitle: "취소")
        alert.window.initialFirstResponder = field
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        let code = field.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !code.isEmpty else { return }
        syncFriendSprites(code: code, interactive: true)
    }

    /// 복사해 둔 글이 친구 코드처럼 생겼나 — 영문·숫자·하이픈 4~20자.
    static func looksLikeCode(_ text: String) -> Bool {
        text.range(of: "^[A-Za-z0-9-]{4,20}$", options: .regularExpression) != nil
    }

    /// 메뉴바에만 사는 앱은 편집 메뉴가 없어서 입력 칸에서 ⌘V·⌘C·⌘A 가 안 먹는다.
    /// 화면에는 안 보이는 메인 메뉴에 편집 메뉴를 달아 단축키만 살린다.
    private func installEditMenu() {
        let main = NSMenu()
        let editItem = NSMenuItem()
        let edit = NSMenu(title: "편집")
        edit.addItem(withTitle: "잘라내기", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "복사하기", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "붙여넣기", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "전체 선택", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        edit.addItem(withTitle: "실행 취소", action: Selector(("undo:")), keyEquivalent: "z")
        editItem.submenu = edit
        main.addItem(editItem)
        NSApp.mainMenu = main
    }

    @objc private func refreshFriendSprites() {
        syncFriendSprites(code: activeFriendCode, interactive: true)
    }

    @objc private func clearFriendCode() {
        let names = UserDefaults.standard.stringArray(forKey: friendFilesKey) ?? []
        for name in names {
            try? FileManager.default.removeItem(at: spritesDirectory.appendingPathComponent(name))
        }
        UserDefaults.standard.removeObject(forKey: friendFilesKey)
        friendCode = nil
        reloadSprites()
        // 넣었던 코드를 지우면 기본 코드의 그림으로 돌아간다.
        syncFriendSprites(code: builtInFriendCode, interactive: false)
    }

    private enum FriendResult {
        case ok(Int)
        case offline
        case badCode
        case failed
    }

    /// 코드로 그림 목록을 받고, 그림을 그림 폴더에 내려받는다. interactive 면 결과를 알려 준다.
    private func syncFriendSprites(code: String, interactive: Bool) {
        Task {
            let result = await fetchFriendSprites(code: code)
            await MainActor.run { self.finishFriendSync(code: code, result: result, interactive: interactive) }
        }
    }

    private func fetchFriendSprites(code: String) async -> FriendResult {
        var request = URLRequest(url: friendSpritesURL)
        request.httpMethod = "POST"
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["code": code])
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if status == 403 { return .badCode }
            guard status == 200,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let files = json["files"] as? [[String: Any]]
            else { return .failed }

            try FileManager.default.createDirectory(at: spritesDirectory, withIntermediateDirectories: true)
            var saved: [String] = []
            for file in files {
                // 이름은 서버가 준 것이라도 경로를 못 벗어나게 마지막 조각만 쓴다.
                guard let rawName = file["name"] as? String, let urlText = file["url"] as? String,
                      let url = URL(string: urlText) else { continue }
                let name = (rawName as NSString).lastPathComponent
                guard spriteExtensions.contains((name as NSString).pathExtension.lowercased()) else { continue }
                let (bytes, fileResponse) = try await URLSession.shared.data(from: url)
                guard (fileResponse as? HTTPURLResponse)?.statusCode == 200, !bytes.isEmpty else { continue }
                try bytes.write(to: spritesDirectory.appendingPathComponent(name), options: .atomic)
                saved.append(name)
            }
            UserDefaults.standard.set(saved, forKey: friendFilesKey)
            return saved.isEmpty ? .failed : .ok(saved.count)
        } catch let error as URLError where Self.offlineCodes.contains(error.code) {
            return .offline
        } catch {
            debugLog("친구 그림 받기 실패 \(error)")
            return .failed
        }
    }

    private static let offlineCodes: Set<URLError.Code> = [
        .notConnectedToInternet, .networkConnectionLost, .cannotFindHost, .cannotConnectToHost,
        .timedOut, .dnsLookupFailed, .dataNotAllowed, .internationalRoamingOff,
    ]

    private func finishFriendSync(code: String, result: FriendResult, interactive: Bool) {
        // 처음 켜서 기다리던 중이면 이제 띄운다 — 받았으면 그림으로, 못 받았으면 도형으로.
        let wasWaiting = waitingForSprites
        stopWaitingForSprites()
        switch result {
        case .ok(let count):
            if code.uppercased() != builtInFriendCode { friendCode = code.uppercased() }
            if !wasWaiting { reloadSprites() }
            if interactive { notify("친구 그림 \(count)장을 받았어요", "이제 그 그림으로 친구들이 나와요.") }
        case .offline:
            // 켤 때 조용히 받다가 끊겨 있어도 알린다 — 주인이 정한 동작이다.
            let again = notify("인터넷 연결이 필요해요",
                               "친구 그림을 받아 오려면 인터넷에 연결되어 있어야 해요. 연결한 뒤 다시 시도해 주세요.",
                               retry: true)
            if again { syncFriendSprites(code: code, interactive: true) }
        case .badCode:
            if interactive || friendCode != nil {
                notify("코드가 맞지 않아요", "친구 코드를 다시 확인해 주세요. 코드가 바뀌었을 수도 있어요.")
            }
        case .failed:
            if interactive { notify("그림을 받지 못했어요", "잠시 뒤에 다시 시도해 주세요.") }
        }
        refreshMenu()
    }

    /// 알림 창. retry 면 「다시 시도」를 눌렀는지 돌려준다.
    @discardableResult
    private func notify(_ title: String, _ body: String, retry: Bool = false) -> Bool {
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = body
        if retry {
            alert.addButton(withTitle: "다시 시도")
            alert.addButton(withTitle: "닫기")
        } else {
            alert.addButton(withTitle: "확인")
        }
        return alert.runModal() == .alertFirstButtonReturn && retry
    }

    // MARK: 업데이트
    //
    // 상어와 같은 두 단계다. 1단계는 「새 버전이 있다」고 메뉴에 알리는 것뿐이고, 2단계는
    // 눌렀을 때 받아서 갈아 끼우는 것이다. 눌러야만 갈아 끼운다 — 켜 두고 사는 앱이 혼자
    // 다시 뜨면 아이들이 다 사라진 것처럼 보인다.

    private var currentVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.0.0"
    }

    private func scheduleUpdateChecks() {
        Timer.scheduledTimer(withTimeInterval: firstUpdateCheckDelay, repeats: false) { [weak self] _ in
            self?.checkForUpdate()
        }
        Timer.scheduledTimer(withTimeInterval: updateCheckInterval, repeats: true) { [weak self] _ in
            self?.checkForUpdate()
        }
    }

    /// 하루 한 번 물어본다. 실패는 조용히 삼킨다.
    private func checkForUpdate() {
        guard var request = URL(string: releaseAPI).map({ URLRequest(url: $0) }) else { return }
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 15

        URLSession.shared.dataTask(with: request) { [weak self] data, _, _ in
            guard let self, let data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let tag = json["tag_name"] as? String,
                  isNewerVersion(tag, than: self.currentVersion)
            else { return }

            let assets = json["assets"] as? [[String: Any]] ?? []
            let zip = assets.first { ($0["name"] as? String)?.hasSuffix(macAssetSuffix) == true }
            let url = (zip?["browser_download_url"] as? String).flatMap(URL.init(string:))

            DispatchQueue.main.async {
                debugLog("새 버전 \(tag)")
                self.updateVersion = tag
                self.updateAsset = url
                self.refreshMenu()
            }
        }.resume()
    }

    /// 2단계 — 받아서 갈아 끼운다. 어느 한 걸음이라도 어긋나면 **손대지 않고** 받는 페이지를 연다.
    @objc private func installUpdate() {
        guard !updating else { return }
        guard let asset = updateAsset else {
            openReleasePage()
            return
        }
        updating = true
        updateNote = "내려받는 중…"
        refreshMenu()

        URLSession.shared.downloadTask(with: asset) { [weak self] location, _, error in
            guard let self else { return }
            guard let location, error == nil else {
                DispatchQueue.main.async { self.updateFailed() }
                return
            }
            // 임시 파일은 이 블록이 끝나면 사라진다. 옆에 옮겨 두고 푼다.
            let work = FileManager.default.temporaryDirectory
                .appendingPathComponent("chiikawa-update-\(UUID().uuidString)")
            let zip = work.appendingPathComponent("app.zip")
            do {
                try FileManager.default.createDirectory(at: work, withIntermediateDirectories: true)
                try FileManager.default.moveItem(at: location, to: zip)
            } catch {
                DispatchQueue.main.async { self.updateFailed() }
                return
            }
            DispatchQueue.main.async { self.swapIn(zip: zip, work: work) }
        }.resume()
    }

    private func swapIn(zip: URL, work: URL) {
        updateNote = "설치하는 중…"
        refreshMenu()

        let unpacked = work.appendingPathComponent("unpacked")
        guard run("/usr/bin/ditto", ["-x", "-k", zip.path, unpacked.path]) == 0,
              let newApp = (try? FileManager.default.contentsOfDirectory(at: unpacked,
                                                                        includingPropertiesForKeys: nil))?
                  .first(where: { $0.pathExtension == "app" })
        else {
            updateFailed()
            return
        }

        // **받은 것이 애플이 검증한 우리 앱인지 본다.** 여기서 걸리면 갈아 끼우지 않는다 —
        // 남의 zip 을 받아 자기 자리에 넣는 일은 절대 없어야 한다.
        guard run("/usr/sbin/spctl", ["--assess", "--type", "execute", newApp.path]) == 0,
              let id = Bundle(url: newApp)?.bundleIdentifier, id == Bundle.main.bundleIdentifier
        else {
            debugLog("업데이트 검증 실패")
            updateFailed()
            return
        }

        let target = Bundle.main.bundleURL
        do {
            _ = try FileManager.default.replaceItemAt(target, withItemAt: newApp)
        } catch {
            // 대개 권한 문제다(/Applications 밖이거나 다른 사용자 소유).
            debugLog("바꿔 끼우기 실패 \(error)")
            updateFailed()
            return
        }

        // 새 것을 띄우고 지금 것은 물러난다. 설정과 그림 폴더는 번들 밖에 있어서 그대로다.
        let config = NSWorkspace.OpenConfiguration()
        config.createsNewApplicationInstance = true
        NSWorkspace.shared.openApplication(at: target, configuration: config) { _, _ in
            DispatchQueue.main.async { NSApp.terminate(nil) }
        }
    }

    /// 못 했으면 **아무것도 건드리지 않고** 사람에게 넘긴다.
    private func updateFailed() {
        updating = false
        updateNote = "직접 받기"
        refreshMenu()
        openReleasePage()
    }

    private func openReleasePage() {
        if let url = URL(string: releasePage) { NSWorkspace.shared.open(url) }
    }

    @discardableResult
    private func run(_ path: String, _ args: [String]) -> Int32 {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: path)
        task.arguments = args
        task.standardOutput = FileHandle.nullDevice
        task.standardError = FileHandle.nullDevice
        do { try task.run() } catch { return -1 }
        task.waitUntilExit()
        return task.terminationStatus
    }

    // MARK: 오버레이

    private func targetScreens() -> [NSScreen] {
        let chosen = chosenScreenNumber
        if chosen != 0, let one = NSScreen.screens.first(where: { Self.number(of: $0) == chosen }) {
            return [one]
        }
        // 고른 모니터가 빠졌으면(케이블을 뽑았으면) 모든 모니터로 돌아간다.
        return NSScreen.screens
    }

    /// 모니터 구성에 맞게 오버레이를 다시 깐다. 그대로인 모니터의 오버레이는 건드리지 않는다 —
    /// 다시 만들면 그 모니터의 아이들이 다 사라졌다 다시 튀어나온다.
    private func rebuildOverlays() {
        if waitingForSprites { return }
        let screens = targetScreens()
        let wanted = Set(screens.map(Self.number(of:)))
        for overlay in overlays where !wanted.contains(overlay.screenNumber) { overlay.close() }
        overlays.removeAll { !wanted.contains($0.screenNumber) }

        for screen in screens {
            let number = Self.number(of: screen)
            if let existing = overlays.first(where: { $0.screenNumber == number }) {
                // 해상도·배치만 바뀌었다.
                existing.window.setFrame(screen.frame, display: true)
                continue
            }
            let overlay = Overlay(screen: screen, bridge: bridgeScript())
            if !visible { overlay.window.orderOut(nil) }
            overlays.append(overlay)
        }
        debugLog("오버레이 \(overlays.count) 장")
    }

    /// 렌더러가 기대하는 window.sneaky. 값은 직렬화에 맡긴다(손으로 따옴표를 붙이지 않는다).
    private func bridgeScript() -> String {
        """
        window.sneaky = {
          maxChars: \(maxChars),
          scale: \(scale),
          debug: \(ProcessInfo.processInfo.environment["CHIIKAWA_DEBUG"] != nil),
          onScale: (handler) => { window.__ckScale = handler },
          sprites: \(jsonString(spriteFiles())),
          onWindows: (handler) => { window.__ckWindows = (data) => handler(data.w, data.m) },
          onMaxChars: (handler) => { window.__ckMaxChars = handler },
          send: (message) => window.webkit.messageHandlers.chiikawa.postMessage(message),
        }
        window.addEventListener('error', (e) => window.webkit.messageHandlers.chiikawa.postMessage({
          type: 'log', text: `${e.message} (${e.filename}:${e.lineno})`,
        }))
        console.error = (...args) => window.webkit.messageHandlers.chiikawa.postMessage({
          type: 'log', text: args.join(' '),
        })
        """
    }

    private func jsonString(_ value: [String]) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: value),
              let json = String(data: data, encoding: .utf8) else { return "[]" }
        return json
    }

    // MARK: 그림 폴더

    @objc private func openSpritesFolder() {
        let fm = FileManager.default
        try? fm.createDirectory(at: spritesDirectory, withIntermediateDirectories: true)
        let guide = spritesDirectory.appendingPathComponent("읽어 주세요.txt")
        if !fm.fileExists(atPath: guide.path) {
            try? spritesGuide.write(to: guide, atomically: true, encoding: .utf8)
        }
        NSWorkspace.shared.open(spritesDirectory)
    }

    @objc private func reloadSprites() {
        let bridge = bridgeScript()
        overlays.forEach { $0.reload(bridge: bridge) }
        refreshMenu()
    }

    // MARK: 창 자리 묻기

    /// 지난번에 물어본 창 목록. 한가할 때는 이걸 다시 쓴다.
    private var cachedWindows: [(id: Int, rect: CGRect)] = []
    private var cachedKey = ""
    private var lastWindowChange = Date.distantPast
    private var pollTick = 0

    /// 화면에 떠 있는 보통 창들을 앞에서 뒤 순서로 **한 번만** 묻고, 모니터마다 나눠 준다.
    ///
    /// **늘 30번 묻지 않는다.** 창 목록을 묻는 일(CGWindowListCopyWindowInfo)이 이 셸에서 제일
    /// 비싸다. 창이 1.5 초 넘게 그대로면 네 번에 한 번(초당 7.5번)만 묻는다 — 창을 끌기 시작하면
    /// 길어야 0.13 초 안에 알아채고 다시 30번으로 돌아간다. 마우스 위치는 싸서 매번 읽는다.
    func poll() {
        guard visible, overlays.contains(where: { $0.ready }) else { return }
        pollTick &+= 1
        let idle = Date().timeIntervalSince(lastWindowChange) > 1.5
        // 한가하면 마우스도 초당 15번이면 된다(아이들이 쳐다보는 데 쓴다).
        if idle && pollTick % 2 == 1 && !cachedKey.isEmpty { return }
        if !idle || pollTick % 4 == 0 || cachedKey.isEmpty {
            let windows = queryWindows()
            let key = windows.map { "\($0.id):\($0.rect)" }.joined(separator: ";")
            if key != cachedKey {
                cachedKey = key
                lastWindowChange = Date()
            }
            cachedWindows = windows
        }
        let mouse = NSEvent.mouseLocation
        for overlay in overlays { overlay.send(windows: cachedWindows, mouse: mouse) }
    }

    private func queryWindows() -> [(id: Int, rect: CGRect)] {
        var windows: [(id: Int, rect: CGRect)] = []
        let ownPID = Int(ProcessInfo.processInfo.processIdentifier)
        if let info = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID)
            as? [[String: Any]] {
            for entry in info {
                // 층 0 = 보통 창. 메뉴바·Dock·알림·떠 있는 패널은 다른 층이다.
                guard (entry[kCGWindowLayer as String] as? Int) == 0,
                      (entry[kCGWindowOwnerPID as String] as? Int) != ownPID,
                      ((entry[kCGWindowAlpha as String] as? Double) ?? 1) > 0.05,
                      let boundsDict = entry[kCGWindowBounds as String] as? NSDictionary,
                      let bounds = CGRect(dictionaryRepresentation: boundsDict as CFDictionary),
                      let number = entry[kCGWindowNumber as String] as? Int
                else { continue }
                guard bounds.width >= minWindowSide, bounds.height >= minWindowSide else { continue }
                windows.append((number, bounds))
            }
        }
        return windows
    }

    // MARK: 메뉴바

    private func buildStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let path = Bundle.main.path(forResource: "tray", ofType: "png"),
           let image = NSImage(contentsOfFile: path) {
            image.isTemplate = true
            image.size = NSSize(width: 18, height: 18)
            statusItem.button?.image = image
        } else {
            statusItem.button?.title = "🐹"
        }
        refreshMenu()
    }

    private func refreshMenu() {
        let menu = NSMenu()

        // 1단계 — 새 버전이 있을 때만 낸다. 없으면 메뉴에 아무 흔적도 없다.
        if let updateVersion {
            let item = NSMenuItem(title: updateNote ?? "새 버전 \(updateVersion) 설치",
                                  action: #selector(installUpdate), keyEquivalent: "")
            item.target = self
            item.isEnabled = !updating
            menu.addItem(item)
            menu.addItem(.separator())
        }

        let toggle = NSMenuItem(title: "숨기기 / 보이기  ⌥⇧K", action: #selector(toggleWindow), keyEquivalent: "")
        toggle.target = self
        menu.addItem(toggle)
        menu.addItem(.separator())

        menu.addItem(countMenu())
        menu.addItem(scaleMenu())
        if NSScreen.screens.count > 1 { menu.addItem(screenMenu()) }
        menu.addItem(.separator())

        let count = spriteFiles().count
        let folder = NSMenuItem(title: count > 0 ? "캐릭터 그림 폴더 열기… (\(count)장)" : "캐릭터 그림 폴더 열기…",
                                action: #selector(openSpritesFolder), keyEquivalent: "")
        folder.target = self
        menu.addItem(folder)
        let reload = NSMenuItem(title: "그림 다시 불러오기", action: #selector(reloadSprites), keyEquivalent: "")
        reload.target = self
        menu.addItem(reload)
        let again = NSMenuItem(title: "친구 그림 다시 받기", action: #selector(refreshFriendSprites), keyEquivalent: "")
        again.target = self
        menu.addItem(again)
        if friendCode == nil {
            let enter = NSMenuItem(title: "친구 코드 입력…", action: #selector(enterFriendCode), keyEquivalent: "")
            enter.target = self
            menu.addItem(enter)
        } else {
            let clear = NSMenuItem(title: "친구 코드 지우기", action: #selector(clearFriendCode), keyEquivalent: "")
            clear.target = self
            menu.addItem(clear)
        }
        menu.addItem(.separator())

        let about = NSMenuItem(title: "바탕화면 치이카와 \(currentVersion)", action: nil, keyEquivalent: "")
        about.isEnabled = false
        menu.addItem(about)
        menu.addItem(NSMenuItem(title: "종료", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        statusItem.menu = menu
    }

    /// 「몇 마리까지 ▸」. 모니터마다 이만큼이다.
    private func countMenu() -> NSMenuItem {
        let submenu = NSMenu()
        for value in [1, 2, 4, 8, 12] {
            let item = NSMenuItem(title: "\(value) 마리", action: #selector(pickCount(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = value
            item.state = value == maxChars ? .on : .off
            submenu.addItem(item)
        }
        let title = NSScreen.screens.count > 1 && overlays.count > 1 ? "몇 마리까지 (모니터마다)" : "몇 마리까지"
        let root = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        root.submenu = submenu
        return root
    }

    /// 「크기 ▸」.
    private func scaleMenu() -> NSMenuItem {
        let submenu = NSMenu()
        for (title, value) in sizeChoices {
            let item = NSMenuItem(title: title, action: #selector(pickScale(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = value
            item.state = abs(value - scale) < 0.001 ? .on : .off
            submenu.addItem(item)
        }
        let root = NSMenuItem(title: "크기", action: nil, keyEquivalent: "")
        root.submenu = submenu
        return root
    }

    @objc private func pickScale(_ sender: NSMenuItem) {
        guard let value = sender.representedObject as? Double else { return }
        scale = value
    }

    @objc private func pickCount(_ sender: NSMenuItem) {
        guard let value = sender.representedObject as? Int else { return }
        maxChars = value
    }

    /// 「모니터 ▸」 모든 모니터 / 한 모니터만.
    private func screenMenu() -> NSMenuItem {
        let submenu = NSMenu()
        let all = NSMenuItem(title: "모든 모니터", action: #selector(pickScreen(_:)), keyEquivalent: "")
        all.target = self
        all.representedObject = 0
        all.state = overlays.count > 1 || chosenScreenNumber == 0 ? .on : .off
        submenu.addItem(all)
        submenu.addItem(.separator())
        for (index, screen) in NSScreen.screens.enumerated() {
            let size = screen.frame.size
            let main = screen.frame.origin == .zero ? " (주 화면)" : ""
            let item = NSMenuItem(title: "\(index + 1)번만  \(Int(size.width))×\(Int(size.height))\(main)",
                                  action: #selector(pickScreen(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = Self.number(of: screen)
            item.state = overlays.count == 1 && overlays[0].screenNumber == Self.number(of: screen)
                && chosenScreenNumber != 0 ? .on : .off
            submenu.addItem(item)
        }
        let root = NSMenuItem(title: "모니터", action: nil, keyEquivalent: "")
        root.submenu = submenu
        return root
    }

    @objc private func pickScreen(_ sender: NSMenuItem) {
        guard let number = sender.representedObject as? Int else { return }
        chosenScreenNumber = number
        rebuildOverlays()
        refreshMenu()
    }

    // MARK: 핫키 — 전역 핫키다. 키 상태 폴링이 아니다(폴링은 키를 안 삼켜서 문서에 글자가 찍힌다).

    private func registerHotKeys() {
        var handler: EventHandlerRef?
        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        InstallEventHandler(GetApplicationEventTarget(), { _, event, _ -> OSStatus in
            var id = EventHotKeyID()
            GetEventParameter(event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID),
                              nil, MemoryLayout<EventHotKeyID>.size, nil, &id)
            App.shared?.hotKeyPressed(id.id)
            return noErr
        }, 1, &spec, nil, &handler)

        var ref: EventHotKeyRef?
        let status = RegisterEventHotKey(Key.toggle.code, Key.toggle.modifiers,
                                         EventHotKeyID(signature: hotKeySignature, id: toggleHotKeyID),
                                         GetApplicationEventTarget(), 0, &ref)
        debugLog("숨기기 핫키 status=\(status)")
        hotKeys.append(ref)
    }

    fileprivate func hotKeyPressed(_ id: UInt32) {
        if id == toggleHotKeyID { toggleWindow() }
    }

    @objc private func toggleWindow() {
        visible.toggle()
        for overlay in overlays {
            if visible { overlay.window.orderFrontRegardless() } else { overlay.window.orderOut(nil) }
        }
        if visible { poll() }
    }

    /// NSScreen.main 은 「키 윈도우가 있는 화면」이라 포커스를 안 갖는 이 앱에서는 엉뚱한
    /// 모니터를 집는다 — 전역 좌표 원점인 쪽이 주 화면이다.
    static var primaryScreen: NSScreen {
        NSScreen.screens.first { $0.frame.origin == .zero } ?? NSScreen.screens.first ?? NSScreen.main!
    }

    static func number(of screen: NSScreen) -> Int {
        (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.intValue ?? -1
    }

    static var shared: App?
}

// MARK: - 시작

let app = NSApplication.shared
let delegate = App()
App.shared = delegate
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
