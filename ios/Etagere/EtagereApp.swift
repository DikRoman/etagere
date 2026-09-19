import SwiftUI

@main
struct EtagereApp: App {
    @StateObject private var library = LibraryStore()
    @StateObject private var auth = AuthStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(library)
                .environmentObject(auth)
        }
    }
}
