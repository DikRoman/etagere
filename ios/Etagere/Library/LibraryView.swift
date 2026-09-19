import SwiftUI

struct LibraryView: View {
    @EnvironmentObject private var library: LibraryStore
    @EnvironmentObject private var auth: AuthStore
    @State private var importing = false
    @State private var showAccount = false
    @State private var showSettings = false

    private let columns = [GridItem(.adaptive(minimum: 140, maximum: 180), spacing: 22, alignment: .top)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                if library.filter == .all || library.filter == .readingNow, library.query.isEmpty {
                    ReadingNowView()
                }

                if library.filter == .readingNow, library.query.isEmpty {
                    recentRail
                }

                LazyVGrid(columns: columns, spacing: 24) {
                    ForEach(library.filteredBooks) { book in
                        Button { library.open(book) } label: {
                            VStack(alignment: .leading, spacing: 8) {
                                BookCoverView(book: book, width: 140)
                                Text(book.title)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(.primary)
                                    .lineLimit(2)
                                Text(book.author ?? L.unknownAuthor)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .buttonStyle(.plain)
                        .contextMenu {
                            Button(L.want) {
                                var next = book
                                next.readingStatus = next.readingStatus == .want ? .none : .want
                                library.update(next)
                            }
                            Button(L.finished) {
                                var next = book
                                next.readingStatus = next.readingStatus == .finished ? .none : .finished
                                library.update(next)
                            }
                            ForEach(library.collections) { collection in
                                Button(collection.name) {
                                    library.toggleCollection(book, collection.id)
                                }
                            }
                            Divider()
                            Button(L.t("Удалить", "Delete"), role: .destructive) {
                                library.remove(book)
                            }
                        }
                    }
                }

                if library.filteredBooks.isEmpty {
                    ContentUnavailableView(
                        library.filter == .readingNow ? L.readingNowEmpty : L.emptyShelf,
                        systemImage: "books.vertical"
                    )
                    .frame(maxWidth: .infinity)
                    .padding(.top, 40)
                }
            }
            .padding(24)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle(library.heading)
        .searchable(text: $library.query, prompt: L.t("Поиск по книгам", "Search books"))
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    importing = true
                } label: {
                    Label(L.addBook, systemImage: "plus")
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button { showAccount = true } label: {
                    Image(systemName: auth.isLoggedIn ? "person.crop.circle.fill" : "person.crop.circle")
                }
                .accessibilityLabel(L.account)
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button { showSettings = true } label: {
                    Image(systemName: "gearshape")
                }
            }
        }
        .fileImporter(
            isPresented: $importing,
            allowedContentTypes: library.allowedTypes(),
            allowsMultipleSelection: true
        ) { result in
            if case .success(let urls) = result {
                library.importURLs(urls)
                if auth.isLoggedIn {
                    Task { await auth.sync(with: library) }
                }
            }
        }
        .sheet(isPresented: $showAccount) { LoginView() }
        .sheet(isPresented: $showSettings) { SettingsView() }
        .alert(L.importFailed, isPresented: Binding(
            get: { library.errorMessage != nil },
            set: { if !$0 { library.errorMessage = nil } }
        )) {
            Button(L.close, role: .cancel) { library.errorMessage = nil }
        }
    }

    @ViewBuilder
    private var recentRail: some View {
        let recent = Array(library.books.sorted { $0.addedAt > $1.addedAt }.prefix(8))
        if !recent.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text(L.recentlyAdded)
                    .font(.headline)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 14) {
                        ForEach(recent) { book in
                            Button { library.open(book) } label: {
                                VStack(alignment: .leading, spacing: 6) {
                                    BookCoverView(book: book, width: 72)
                                    Text(book.title)
                                        .font(.caption2)
                                        .lineLimit(2)
                                        .frame(width: 72, alignment: .leading)
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
    }
}

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var russian = L.isRussian

    var body: some View {
        NavigationStack {
            Form {
                Section(L.language) {
                    Picker(L.language, selection: $russian) {
                        Text("Русский").tag(true)
                        Text("English").tag(false)
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: russian) { _, on in
                        L.setRussian(on)
                    }
                }
            }
            .navigationTitle(L.settings)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L.close) { dismiss() }
                }
            }
        }
    }
}
