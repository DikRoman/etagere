import SwiftUI

struct ReaderView: View {
    @EnvironmentObject private var library: LibraryStore
    @Environment(\.dismiss) private var dismiss

    let book: Book

    @State private var page: Int
    @State private var pageCount: Int
    @State private var chrome = true
    @State private var spread = true
    @State private var theme: ReaderTheme = .paper
    @State private var tool: ReaderTool = .browse
    @State private var showAppearance = false
    @State private var epubCommand: EPUBCommand?
    @State private var commandNonce = 0

    init(book: Book) {
        self.book = book
        _page = State(initialValue: max(1, book.lastPage))
        _pageCount = State(initialValue: max(1, book.pageCount))
    }

    var body: some View {
        ZStack {
            background.ignoresSafeArea()
            readerStage
            if chrome { chromeOverlay }
        }
        .statusBarHidden(!chrome)
        .onAppear {
            spread = UIDevice.current.orientation.isLandscape || UIScreen.main.bounds.width > 900
        }
        .onChange(of: page) { _, new in
            library.setPage(book, page: new)
        }
        .onDisappear {
            library.setPage(book, page: page)
        }
        .preferredColorScheme(theme == .night ? .dark : .light)
    }

    @ViewBuilder
    private var readerStage: some View {
        let url = BookStorage.fileURL(for: book)
        if book.format == .pdf {
            PDFKitView(
                bookId: book.id,
                url: url,
                page: $page,
                pageCount: $pageCount,
                spread: spread,
                tool: tool,
                onTapZone: handle(zone:)
            )
        } else {
            EPUBWebView(
                url: url,
                theme: theme,
                spread: spread,
                command: epubCommand,
                onRelocated: { index, count, _ in
                    page = index
                    pageCount = max(count, 1)
                    var next = library.books.first(where: { $0.id == book.id }) ?? book
                    next.pageCount = max(count, 1)
                    library.update(next)
                },
                onTapChrome: { chrome.toggle() },
                onTurn: { dir in
                    commandNonce += 1
                    epubCommand = EPUBCommand(kind: dir > 0 ? .next : .prev, nonce: commandNonce)
                }
            )
        }
    }

    private var chromeOverlay: some View {
        VStack(spacing: 0) {
            topBar
            Spacer()
            bottomBar
        }
        .transition(.opacity)
        .animation(.easeInOut(duration: 0.2), value: chrome)
    }

    private var topBar: some View {
        HStack {
            Button {
                dismiss()
            } label: {
                Label(L.library, systemImage: "chevron.left")
                    .labelStyle(.titleAndIcon)
            }
            Spacer()
            Text(book.title)
                .font(.headline)
                .lineLimit(1)
            Spacer()
            Button {
                library.toggleBookmark(currentBook, page: page)
            } label: {
                Image(systemName: currentBook.bookmarks.contains(page) ? "bookmark.fill" : "bookmark")
            }
            .accessibilityLabel(L.bookmark)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.ultraThinMaterial)
    }

    private var bottomBar: some View {
        VStack(spacing: 8) {
            if showAppearance {
                appearanceTray
            }
            HStack(spacing: 8) {
                Button {
                    showAppearance.toggle()
                } label: {
                    Image(systemName: "textformat.size")
                }
                .accessibilityLabel(L.appearance)

                if book.format == .pdf {
                    Button {
                        tool = tool == .pencil ? .browse : .pencil
                    } label: {
                        Image(systemName: "pencil.tip")
                            .symbolVariant(tool == .pencil ? .fill : .none)
                    }
                    .accessibilityLabel(L.markup)
                    Button {
                        NotificationCenter.default.post(name: .etagereHighlight, object: nil)
                    } label: {
                        Image(systemName: "highlighter")
                    }
                }

                Button { turn(-1) } label: {
                    Image(systemName: "chevron.left")
                }
                Slider(
                    value: Binding(
                        get: { Double(page) },
                        set: { go(to: Int($0.rounded())) }
                    ),
                    in: 1...Double(max(pageCount, 1)),
                    step: 1
                )
                Button { turn(1) } label: {
                    Image(systemName: "chevron.right")
                }

                Text("\(page) / \(pageCount)")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
                    .frame(minWidth: 64, alignment: .trailing)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        }
        .background(.ultraThinMaterial)
    }

    private var appearanceTray: some View {
        HStack(spacing: 12) {
            ForEach(ReaderTheme.allCases) { item in
                Button(title(for: item)) { theme = item }
                    .buttonStyle(.bordered)
                    .tint(theme == item ? .accentColor : .secondary)
            }
            Toggle(L.spread, isOn: $spread)
                .toggleStyle(.button)
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
    }

    private var background: Color {
        switch theme {
        case .day: return Color(red: 0.97, green: 0.97, blue: 0.96)
        case .paper: return Color(red: 0.96, green: 0.93, blue: 0.85)
        case .night: return Color(red: 0.07, green: 0.09, blue: 0.11)
        }
    }

    private var currentBook: Book {
        library.books.first(where: { $0.id == book.id }) ?? book
    }

    private func title(for theme: ReaderTheme) -> String {
        switch theme {
        case .day: return L.themeDay
        case .paper: return L.themePaper
        case .night: return L.themeNight
        }
    }

    private func handle(zone: PDFKitView.TapZone) {
        switch zone {
        case .prev: turn(-1)
        case .next: turn(1)
        case .chrome: chrome.toggle()
        }
    }

    private func turn(_ dir: Int) {
        if book.format == .epub {
            commandNonce += 1
            epubCommand = EPUBCommand(kind: dir > 0 ? .next : .prev, nonce: commandNonce)
            return
        }
        go(to: page + dir * (spread ? 2 : 1))
    }

    private func go(to target: Int) {
        page = min(max(1, target), max(pageCount, 1))
    }
}
