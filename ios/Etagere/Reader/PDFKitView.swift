import PDFKit
import PencilKit
import SwiftUI
import UIKit

extension Notification.Name {
    static let etagereHighlight = Notification.Name("etagereHighlight")
}

struct PDFKitView: UIViewRepresentable {
    let bookId: UUID
    let url: URL
    @Binding var page: Int
    @Binding var pageCount: Int
    var spread: Bool
    var tool: ReaderTool
    var onTapZone: (TapZone) -> Void

    enum TapZone { case prev, next, chrome }

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeUIView(context: Context) -> PDFHostView {
        let host = PDFHostView()
        host.pdfView.autoScales = true
        host.pdfView.displayDirection = .horizontal
        host.pdfView.usePageViewController(true, withViewOptions: nil)
        host.pdfView.backgroundColor = .clear
        host.coordinator = context.coordinator
        context.coordinator.host = host
        host.attachBook(bookId)
        host.onTap = { zone in
            context.coordinator.parent.onTapZone(zone)
        }
        load(host: host)
        return host
    }

    func updateUIView(_ host: PDFHostView, context: Context) {
        context.coordinator.parent = self
        host.tool = tool
        host.attachBook(bookId)
        let mode: PDFDisplayMode = spread ? .twoUp : .singlePage
        if host.pdfView.displayMode != mode {
            host.pdfView.displayMode = mode
            host.pdfView.displaysAsBook = spread
        }
        if host.pdfView.document?.documentURL != url {
            load(host: host)
        }
        if let document = host.pdfView.document,
           let current = host.pdfView.currentPage
        {
            let target = min(max(page, 1), max(document.pageCount, 1)) - 1
            if document.index(for: current) != target, let pdfPage = document.page(at: target) {
                host.pdfView.go(to: pdfPage)
            }
        }
        host.canvas.isUserInteractionEnabled = tool == .pencil
        host.canvas.drawingGestureRecognizer.isEnabled = tool == .pencil
    }

    static func dismantleUIView(_ uiView: PDFHostView, coordinator: Coordinator) {
        uiView.saveCurrentDrawing()
        NotificationCenter.default.removeObserver(uiView)
    }

    private func load(host: PDFHostView) {
        let document = PDFDocument(url: url)
        host.pdfView.document = document
        host.pdfView.displayMode = spread ? .twoUp : .singlePage
        host.pdfView.displaysAsBook = spread
        if let document {
            pageCount = document.pageCount
            let target = min(max(page, 1), max(document.pageCount, 1)) - 1
            if let pdfPage = document.page(at: target) {
                host.pdfView.go(to: pdfPage)
            }
            host.loadDrawing(for: target + 1)
        }
    }

    final class Coordinator: NSObject {
        var parent: PDFKitView
        weak var host: PDFHostView?

        init(_ parent: PDFKitView) {
            self.parent = parent
        }

        func pageChanged() {
            guard let page = host?.pdfView.currentPage,
                  let document = host?.pdfView.document
            else { return }
            let index = document.index(for: page) + 1
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                if self.parent.page != index {
                    self.parent.page = index
                }
                self.host?.loadDrawing(for: index)
            }
        }
    }
}

final class PDFHostView: UIView {
    let pdfView = PDFView()
    let canvas = PKCanvasView()
    var tool: ReaderTool = .browse
    var onTap: ((PDFKitView.TapZone) -> Void)?
    var coordinator: PDFKitView.Coordinator? {
        didSet {
            NotificationCenter.default.removeObserver(self)
            if coordinator != nil {
                NotificationCenter.default.addObserver(
                    self,
                    selector: #selector(pageChanged),
                    name: .PDFViewPageChanged,
                    object: pdfView
                )
            }
        }
    }

    private var currentBookId: UUID?
    private var loadedPage = 0

    override init(frame: CGRect) {
        super.init(frame: frame)
        pdfView.translatesAutoresizingMaskIntoConstraints = false
        canvas.translatesAutoresizingMaskIntoConstraints = false
        canvas.backgroundColor = .clear
        canvas.isOpaque = false
        canvas.drawingPolicy = .anyInput
        canvas.isUserInteractionEnabled = false
        addSubview(pdfView)
        addSubview(canvas)
        NSLayoutConstraint.activate([
            pdfView.topAnchor.constraint(equalTo: topAnchor),
            pdfView.bottomAnchor.constraint(equalTo: bottomAnchor),
            pdfView.leadingAnchor.constraint(equalTo: leadingAnchor),
            pdfView.trailingAnchor.constraint(equalTo: trailingAnchor),
            canvas.topAnchor.constraint(equalTo: topAnchor),
            canvas.bottomAnchor.constraint(equalTo: bottomAnchor),
            canvas.leadingAnchor.constraint(equalTo: leadingAnchor),
            canvas.trailingAnchor.constraint(equalTo: trailingAnchor),
        ])
        let tap = UITapGestureRecognizer(target: self, action: #selector(tapped(_:)))
        tap.cancelsTouchesInView = false
        pdfView.addGestureRecognizer(tap)
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(highlightSelection),
            name: .etagereHighlight,
            object: nil
        )
    }

    required init?(coder: NSCoder) { nil }

    func attachBook(_ id: UUID) {
        currentBookId = id
    }

    func loadDrawing(for page: Int) {
        if loadedPage == page { return }
        saveCurrentDrawing()
        loadedPage = page
        guard let id = currentBookId else {
            canvas.drawing = PKDrawing()
            return
        }
        let url = BookStorage.pencilURL(bookId: id, page: page)
        if let data = try? Data(contentsOf: url),
           let drawing = try? PKDrawing(data: data)
        {
            canvas.drawing = drawing
        } else {
            canvas.drawing = PKDrawing()
        }
    }

    func saveCurrentDrawing() {
        guard loadedPage > 0, let id = currentBookId else { return }
        let url = BookStorage.pencilURL(bookId: id, page: loadedPage)
        try? canvas.drawing.dataRepresentation().write(to: url, options: .atomic)
    }

    @objc private func pageChanged() {
        coordinator?.pageChanged()
    }

    @objc private func highlightSelection() {
        guard let selection = pdfView.currentSelection else { return }
        for page in selection.pages {
            let bounds = selection.bounds(for: page)
            let annotation = PDFAnnotation(bounds: bounds, forType: .highlight, withProperties: nil)
            annotation.color = UIColor.systemYellow.withAlphaComponent(0.4)
            page.addAnnotation(annotation)
        }
        if let url = pdfView.document?.documentURL {
            pdfView.document?.write(to: url)
        }
        pdfView.clearSelection()
    }

    @objc private func tapped(_ gesture: UITapGestureRecognizer) {
        guard tool == .browse else { return }
        let x = gesture.location(in: self).x
        let w = bounds.width
        let edge = min(140, max(64, w * 0.2))
        if x < edge { onTap?(.prev) }
        else if x > w - edge { onTap?(.next) }
        else { onTap?(.chrome) }
    }
}
