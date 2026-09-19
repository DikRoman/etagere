import SwiftUI

struct RootView: View {
    @EnvironmentObject private var library: LibraryStore
    @EnvironmentObject private var auth: AuthStore
    @State private var columnVisibility: NavigationSplitViewVisibility = .all

    var body: some View {
        NavigationSplitView(columnVisibility: $columnVisibility) {
            SidebarView()
                .navigationSplitViewColumnWidth(min: 220, ideal: 260, max: 320)
        } detail: {
            NavigationStack {
                LibraryView()
            }
        }
        .fullScreenCover(item: $library.openedBook) { book in
            ReaderView(book: book)
                .environmentObject(library)
        }
        .onAppear {
            library.hydrate()
            auth.hydrate()
            if auth.isLoggedIn {
                Task { await auth.sync(with: library) }
            }
        }
        .onOpenURL { url in
            library.importURLs([url])
        }
    }
}
