import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var library: LibraryStore
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        NavigationStack {
            Form {
                Section(L.server) {
                    TextField("https://api.etagere.ru", text: $auth.serverURL)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                }
                if auth.isLoggedIn {
                    Section {
                        Text(auth.user?.email ?? auth.user?.name ?? "—")
                        Button(L.signOut, role: .destructive, action: auth.logout)
                    }
                } else {
                    Section(L.signIn) {
                        TextField(L.email, text: $email)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.emailAddress)
                        SecureField(L.password, text: $password)
                        Button(L.signIn) {
                            Task {
                                await auth.login(email: email, password: password)
                                if auth.isLoggedIn {
                                    await auth.sync(with: library)
                                }
                            }
                        }
                        .disabled(auth.isBusy || email.isEmpty || password.isEmpty)
                    }
                }
                if let status = auth.statusMessage {
                    Section { Text(status).foregroundStyle(.secondary) }
                }
            }
            .navigationTitle(L.account)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L.close) { dismiss() }
                }
                if auth.isLoggedIn {
                    ToolbarItem(placement: .primaryAction) {
                        Button(L.synced) {
                            Task { await auth.sync(with: library) }
                        }
                        .disabled(auth.isBusy)
                    }
                }
            }
        }
    }
}
