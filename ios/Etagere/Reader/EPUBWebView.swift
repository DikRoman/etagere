import SwiftUI
import WebKit

struct EPUBCommand: Equatable {
    enum Kind: Equatable {
        case next
        case prev
        case open(String)
    }

    var kind: Kind
    var nonce: Int
}

struct EPUBWebView: UIViewRepresentable {
    let url: URL
    var theme: ReaderTheme
    var spread: Bool
    var command: EPUBCommand?
    var onRelocated: (Int, Int, String) -> Void
    var onTapChrome: () -> Void
    var onTurn: (Int) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeUIView(context: Context) -> WKWebView {
        let user = WKUserContentController()
        user.add(context.coordinator, name: "etagere")
        let config = WKWebViewConfiguration()
        config.userContentController = user
        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = .clear
        web.scrollView.bounces = false
        web.navigationDelegate = context.coordinator
        context.coordinator.webView = web
        context.coordinator.load(bookURL: url)
        return web
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.parent = self
        context.coordinator.applyTheme()
        if let command, command != context.coordinator.lastCommand {
            context.coordinator.lastCommand = command
            context.coordinator.run(command)
        }
    }

    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "etagere")
    }

    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        var parent: EPUBWebView
        weak var webView: WKWebView?
        var lastCommand: EPUBCommand?
        private var sessionDir: URL?

        init(_ parent: EPUBWebView) {
            self.parent = parent
        }

        func load(bookURL: URL) {
            let session = FileManager.default.temporaryDirectory
                .appendingPathComponent("epub-\(UUID().uuidString)", isDirectory: true)
            try? FileManager.default.createDirectory(at: session, withIntermediateDirectories: true)
            sessionDir = session
            copyResource("index", ext: "html", into: session)
            copyResource("jszip.min", ext: "js", into: session)
            copyResource("epub.min", ext: "js", into: session)
            copyResource("bridge", ext: "js", into: session)
            let dest = session.appendingPathComponent("book.epub")
            try? FileManager.default.copyItem(at: bookURL, to: dest)
            let index = session.appendingPathComponent("index.html")
            webView?.loadFileURL(index, allowingReadAccessTo: session)
        }

        private func copyResource(_ name: String, ext: String, into dir: URL) {
            let dest = dir.appendingPathComponent("\(name).\(ext)")
            let file = "\(name).\(ext)"
            let urls = [
                Bundle.main.url(forResource: name, withExtension: ext, subdirectory: "EPUBReader"),
                Bundle.main.url(forResource: name, withExtension: ext, subdirectory: "Reader/EPUBReader"),
                Bundle.main.url(forResource: name, withExtension: ext),
            ].compactMap { $0 }
            let match = urls.first ?? Bundle.main.urls(forResourcesWithExtension: ext, subdirectory: nil)?
                .first { $0.lastPathComponent == file }
            guard let source = match else { return }
            try? FileManager.default.copyItem(at: source, to: dest)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            applyTheme()
            webView.evaluateJavaScript("window.Etagere && window.Etagere.open('book.epub')")
        }

        func applyTheme() {
            let name = parent.theme.rawValue
            let spread = parent.spread ? "true" : "false"
            webView?.evaluateJavaScript("window.Etagere && window.Etagere.setTheme('\(name)', \(spread))")
        }

        func run(_ command: EPUBCommand) {
            switch command.kind {
            case .next:
                webView?.evaluateJavaScript("window.Etagere && window.Etagere.next()")
            case .prev:
                webView?.evaluateJavaScript("window.Etagere && window.Etagere.prev()")
            case .open(let href):
                let escaped = href.replacingOccurrences(of: "'", with: "\\'")
                webView?.evaluateJavaScript("window.Etagere && window.Etagere.go('\(escaped)')")
            }
        }

        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
            switch type {
            case "relocated":
                let index = body["index"] as? Int ?? 1
                let count = body["count"] as? Int ?? 1
                let href = body["href"] as? String ?? ""
                parent.onRelocated(index, count, href)
            case "tap":
                let zone = body["zone"] as? String
                if zone == "prev" { parent.onTurn(-1) }
                else if zone == "next" { parent.onTurn(1) }
                else { parent.onTapChrome() }
            default:
                break
            }
        }
    }
}
