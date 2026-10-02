// 바탕화면 치이카와 — macOS 셸.
//
// 아이들은 전부 web/ 안의 HTML·Canvas·JS 다. 이 파일이 하는 일:
//   1. 화면을 덮는 투명·클릭 통과·항상 위 오버레이를 띄운다.
//   2. 지금 화면에 떠 있는 **창들의 자리**를 1/30 초마다 물어 웹뷰에 넘긴다.
//   3. 마우스 위치도 같이 넘긴다(아이들이 쳐다본다).
//   4. 전역 핫키 ⌥⇧K 로 숨기기/보이기, 메뉴바 메뉴.
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

func debugLog(_ text: String) {
    guard ProcessInfo.processInfo.environment["CHIIKAWA_DEBUG"] != nil else { return }
    FileHandle.standardError.write("[chiikawa] \(text)\n".data(using: .utf8)!)
}

// MARK: - 번들 안의 웹 파일을 넘겨주는 핸들러

/// file:// 로 열면 ES 모듈 import 가 막힌다. 커스텀 스킴으로 번들 Resources/web 을 내준다.
final class WebAssetHandler: NSObject, WKURLSchemeHandler {
    private let root: URL

    init(root: URL) {
        self.root = root
    }

    private static let mimeTypes = [
        "html": "text/html", "js": "text/javascript", "css": "text/css",
        "json": "application/json", "png": "image/png",
    ]

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        let relative = url.path.isEmpty || url.path == "/" ? "/renderer/index.html" : url.path
        let file = root.appendingPathComponent(relative).standardized

        guard file.path.hasPrefix(root.path), let data = try? Data(contentsOf: file) else {
            task.didFailWithError(URLError(.fileDoesNotExist))
            return
        }

        let mime = Self.mimeTypes[file.pathExtension] ?? "application/octet-stream"
        let response = URLResponse(url: url, mimeType: mime,
                                   expectedContentLength: data.count, textEncodingName: "utf-8")
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

// MARK: - 앱

final class App: NSObject, NSApplicationDelegate, WKScriptMessageHandler {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var statusItem: NSStatusItem!
    private var hotKeys: [EventHotKeyRef?] = []
    private var pollTimer: Timer?
    private var lastPayload = ""
    private var ready = false

    private var maxChars: Int {
        get {
            let saved = UserDefaults.standard.integer(forKey: maxCharsKey)
            return saved > 0 ? saved : 8
        }
        set {
            UserDefaults.standard.set(newValue, forKey: maxCharsKey)
            webView.evaluateJavaScript("window.__ckMaxChars && window.__ckMaxChars(\(newValue))")
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
            webView.evaluateJavaScript("window.__ckScale && window.__ckScale(\(newValue))")
            refreshMenu()
        }
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildWindow()
        buildStatusItem()
        registerHotKeys()

        NotificationCenter.default.addObserver(
            forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main
        ) { [weak self] _ in
            self?.moveToChosenScreen()
            self?.refreshMenu()
        }

        let timer = Timer(timeInterval: pollInterval, repeats: true) { [weak self] _ in self?.poll() }
        // 메뉴를 열어 둔 동안에도(트래킹 런루프 모드) 계속 돈다.
        RunLoop.main.add(timer, forMode: .common)
        pollTimer = timer
    }

    // MARK: 창

    private func buildWindow() {
        // 메뉴바까지 덮는다 — 최대화한 창 윗변에 선 아이는 메뉴바 자리에 서 있게 된다.
        let frame = chosenScreen().frame

        window = NSWindow(contentRect: frame, styleMask: .borderless, backing: .buffered, defer: false)
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
        config.userContentController.add(self, name: "chiikawa")
        config.userContentController.addUserScript(
            WKUserScript(source: bridgeScript(), injectionTime: .atDocumentStart, forMainFrameOnly: true)
        )

        webView = WKWebView(frame: window.contentView!.bounds, configuration: config)
        webView.autoresizingMask = [.width, .height]
        webView.setValue(false, forKey: "drawsBackground")
        webView.load(URLRequest(url: URL(string: "\(webScheme)://app/renderer/index.html")!))

        window.contentView?.addSubview(webView)
        window.orderFrontRegardless() // 포커스는 절대 가져가지 않는다
    }

    /// 렌더러가 기대하는 window.sneaky. 값은 직렬화에 맡긴다(손으로 따옴표를 붙이지 않는다).
    private func bridgeScript() -> String {
        """
        window.sneaky = {
          maxChars: \(maxChars),
          scale: \(scale),
          debug: \(ProcessInfo.processInfo.environment["CHIIKAWA_DEBUG"] != nil),
          onScale: (handler) => { window.__ckScale = handler },
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

    // MARK: 창 자리 묻기

    /// 화면에 떠 있는 보통 창들을 앞에서 뒤 순서로, 오버레이 좌표(왼쪽 위 원점, 포인트)로.
    private func poll() {
        guard ready, window.isVisible else { return }
        let screen = window.frame
        // CG 좌표는 주 화면 왼쪽 위가 원점이고 아래로 갈수록 y 가 커진다. 코코아는 반대다.
        let primaryHeight = App.primaryScreen.frame.height
        let originX = screen.minX
        let originY = primaryHeight - screen.maxY

        var rows: [[Int]] = []
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
                let local = bounds.offsetBy(dx: -originX, dy: -originY)
                guard local.intersects(CGRect(origin: .zero, size: screen.size)) else { continue }
                rows.append([number, Int(local.minX.rounded()), Int(local.minY.rounded()),
                             Int(local.width.rounded()), Int(local.height.rounded())])
            }
        }

        let mouse = NSEvent.mouseLocation
        let mx = Int((mouse.x - screen.minX).rounded())
        let my = Int((screen.maxY - mouse.y).rounded())

        let payload: [String: Any] = ["w": rows, "m": [mx, my]]
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        if json == lastPayload { return }
        lastPayload = json
        webView.evaluateJavaScript("window.__ckWindows && window.__ckWindows(\(json))")
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

        let toggle = NSMenuItem(title: "숨기기 / 보이기  ⌥⇧K", action: #selector(toggleWindow), keyEquivalent: "")
        toggle.target = self
        menu.addItem(toggle)
        menu.addItem(.separator())

        menu.addItem(countMenu())
        menu.addItem(scaleMenu())
        if NSScreen.screens.count > 1 { menu.addItem(screenMenu()) }
        menu.addItem(.separator())

        menu.addItem(NSMenuItem(title: "종료", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        statusItem.menu = menu
    }

    /// 「몇 마리까지 ▸」.
    private func countMenu() -> NSMenuItem {
        let submenu = NSMenu()
        for value in [1, 2, 4, 8, 12] {
            let item = NSMenuItem(title: "\(value) 마리", action: #selector(pickCount(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = value
            item.state = value == maxChars ? .on : .off
            submenu.addItem(item)
        }
        let root = NSMenuItem(title: "몇 마리까지", action: nil, keyEquivalent: "")
        root.submenu = submenu
        return root
    }

    /// 「크기 ▸」.
    private func scaleMenu() -> NSMenuItem {
        let submenu = NSMenu()
        for (title, value) in [("작게", 0.9), ("보통", 1.2), ("크게", 1.6), ("아주 크게", 2.2)] {
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

    private func screenMenu() -> NSMenuItem {
        let submenu = NSMenu()
        let current = chosenScreen()
        for (index, screen) in NSScreen.screens.enumerated() {
            let size = screen.frame.size
            let main = screen.frame.origin == .zero ? " (주 화면)" : ""
            let item = NSMenuItem(title: "\(index + 1)번  \(Int(size.width))×\(Int(size.height))\(main)",
                                  action: #selector(pickScreen(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = Self.number(of: screen)
            item.state = screen == current ? .on : .off
            submenu.addItem(item)
        }
        let root = NSMenuItem(title: "모니터", action: nil, keyEquivalent: "")
        root.submenu = submenu
        return root
    }

    @objc private func pickScreen(_ sender: NSMenuItem) {
        guard let number = sender.representedObject as? Int else { return }
        UserDefaults.standard.set(number, forKey: screenKey)
        moveToChosenScreen()
        refreshMenu()
    }

    private func chosenScreen() -> NSScreen {
        let saved = UserDefaults.standard.object(forKey: screenKey) as? Int
        return NSScreen.screens.first { Self.number(of: $0) == saved } ?? Self.primaryScreen
    }

    private func moveToChosenScreen() {
        window.setFrame(chosenScreen().frame, display: true)
        lastPayload = "" // 좌표 원점이 바뀌었으니 같은 목록이라도 다시 보낸다
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
        if window.isVisible {
            window.orderOut(nil)
        } else {
            lastPayload = ""
            window.orderFrontRegardless()
        }
    }

    // MARK: 웹에서 오는 말

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        switch type {
        case "ready":
            ready = true
            lastPayload = ""
            poll()
        case "log":
            if let text = body["text"] as? String {
                FileHandle.standardError.write("[web] \(text)\n".data(using: .utf8)!)
            }
        default:
            break
        }
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
