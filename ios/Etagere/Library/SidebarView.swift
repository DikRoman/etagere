import SwiftUI

struct SidebarView: View {
    @EnvironmentObject private var library: LibraryStore
    @State private var newName = ""
    @State private var creating = false

    var body: some View {
        List(selection: $library.filter) {
            Section(L.library) {
                Label(L.readingNow, systemImage: "bookmark.fill").tag(LibraryFilter.readingNow)
                Label(L.all, systemImage: "square.grid.2x2.fill").tag(LibraryFilter.all)
                Label(L.want, systemImage: "plus.circle").tag(LibraryFilter.want)
                Label(L.finished, systemImage: "checkmark.circle").tag(LibraryFilter.finished)
                Label(L.books, systemImage: "book.closed").tag(LibraryFilter.epub)
                Label(L.pdfs, systemImage: "doc.richtext").tag(LibraryFilter.pdf)
            }
            Section(L.collections) {
                ForEach(library.collections) { collection in
                    Label {
                        HStack {
                            Text(collection.name)
                            Spacer()
                            let n = library.books.filter { $0.collectionIds.contains(collection.id) }.count
                            if n > 0 {
                                Text("\(n)").foregroundStyle(.secondary).font(.caption)
                            }
                        }
                    } icon: {
                        Image(systemName: "rectangle.stack")
                    }
                    .tag(LibraryFilter.collection(collection.id))
                    .swipeActions {
                        Button(role: .destructive) {
                            library.deleteCollection(collection.id)
                        } label: {
                            Label(L.t("Удалить", "Delete"), systemImage: "trash")
                        }
                    }
                }
                if creating {
                    TextField(L.newCollection, text: $newName)
                        .onSubmit {
                            library.createCollection(name: newName)
                            newName = ""
                            creating = false
                        }
                } else {
                    Button {
                        creating = true
                    } label: {
                        Label(L.newCollection, systemImage: "plus")
                    }
                }
            }
        }
        .listStyle(.sidebar)
        .navigationTitle("Étagère")
    }
}
