import Capacitor
import PassKit
import UIKit

// Adds a signed .pkpass to Apple Wallet. WKWebView cannot open a pass
// download the way Safari does, so the web layer (src/lib/native.js,
// addPassToAppleWallet) sends the pass bytes here as base64 and this presents
// the system "Add to Apple Wallet" sheet.
//
// No Wallet entitlement is needed: PKAddPassesViewController lets the user add
// any validly signed pass. The com.apple.developer.pass-type-identifiers
// entitlement is only for reading or changing passes through PKPassLibrary.
@objc(DoorManWalletPlugin)
public class DoorManWalletPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DoorManWalletPlugin"
    public let jsName = "DoorManWallet"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "addPass", returnType: CAPPluginReturnPromise)
    ]

    @objc func addPass(_ call: CAPPluginCall) {
        guard let base64 = call.getString("data"),
              let data = Data(base64Encoded: base64) else {
            call.reject("Missing pass data", "INVALID_ARGUMENT")
            return
        }
        guard PKAddPassesViewController.canAddPasses() else {
            call.reject("This device can't add passes to Apple Wallet.", "UNAVAILABLE")
            return
        }
        let pass: PKPass
        do {
            pass = try PKPass(data: data)
        } catch {
            call.reject("The Wallet pass is not valid.", "INVALID_PASS", error)
            return
        }
        DispatchQueue.main.async { [weak self] in
            guard let sheet = PKAddPassesViewController(pass: pass),
                  let presenter = self?.bridge?.viewController else {
                call.reject("Couldn't open Apple Wallet.", "UNAVAILABLE")
                return
            }
            presenter.present(sheet, animated: true) {
                call.resolve(["presented": true])
            }
        }
    }
}

// Registers the plugin before the web view loads, so the JS side sees it in
// Capacitor.isPluginAvailable("DoorManWallet"). Kept in this file, as an
// override in an extension (allowed because viewDidLoad is @objc), so
// MainViewController.swift stays identical to the swipe-back change.
extension MainViewController {
    override public func viewDidLoad() {
        bridge?.registerPluginInstance(DoorManWalletPlugin())
        super.viewDidLoad()
    }
}
