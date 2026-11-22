import ExpoModulesCore
import NetworkExtension
import CoreLocation

private final class WhenInUseGate: NSObject, CLLocationManagerDelegate {
  private let manager = CLLocationManager()
  private var waiter: ((CLAuthorizationStatus) -> Void)?

  func request(_ done: @escaping (CLAuthorizationStatus) -> Void) {
    let status = manager.authorizationStatus
    if status != .notDetermined {
      done(status)
      return
    }
    waiter = done
    manager.delegate = self
    manager.requestWhenInUseAuthorization()
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    let status = manager.authorizationStatus
    guard status != .notDetermined else { return }
    let done = waiter
    waiter = nil
    done?(status)
  }
}

public class RobotWifiModule: Module {
  private let location = WhenInUseGate()
  private var joinedSsid: String?
  private var joinInFlight = false
  private var joinGeneration = 0

  public func definition() -> ModuleDefinition {
    Name("RobotWifi")

    // There is no scan method. iOS cannot list nearby SSIDs for a third-party app.
    AsyncFunction("readCurrentSsid") { (promise: Promise) in
      DispatchQueue.main.async {
        self.location.request { status in
          switch status {
          case .authorizedAlways, .authorizedWhenInUse:
            NEHotspotNetwork.fetchCurrent { network in
              promise.resolve(network?.ssid)
            }
          case .denied, .restricted:
            promise.reject("permission_blocked", "permission_blocked")
          default:
            promise.reject("permission_denied", "permission_denied")
          }
        }
      }
    }

    AsyncFunction("joinKnownSsid") { (ssid: String, promise: Promise) in
      let clean = ssid.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !clean.isEmpty, clean.count <= 32 else {
        promise.reject("join_failed", "join_failed")
        return
      }
      self.releaseJoinedNetwork()
      let generation = self.joinGeneration
      self.joinInFlight = true
      let configuration = NEHotspotConfiguration(ssid: clean)
      configuration.joinOnce = true
      NEHotspotConfigurationManager.shared.apply(configuration) { error in
        self.joinInFlight = false
        if generation != self.joinGeneration {
          NEHotspotConfigurationManager.shared.removeConfiguration(forSSID: clean)
          promise.resolve("cancelled")
          return
        }
        if let error = error as NSError? {
          if error.domain == NEHotspotConfigurationErrorDomain {
            if error.code == NEHotspotConfigurationError.alreadyAssociated.rawValue {
              self.joinedSsid = clean
              promise.resolve("already")
              return
            }
            if error.code == NEHotspotConfigurationError.userDenied.rawValue {
              promise.resolve("cancelled")
              return
            }
          }
          promise.reject("join_failed", "join_failed")
          return
        }
        self.joinedSsid = clean
        promise.resolve("joined")
      }
    }

    AsyncFunction("releaseJoinedNetwork") {
      self.releaseJoinedNetwork()
    }
  }

  private func releaseJoinedNetwork() {
    let ssid = joinedSsid
    let inFlight = joinInFlight
    guard ssid != nil || inFlight else { return }
    joinGeneration += 1
    joinInFlight = false
    joinedSsid = nil
    if let ssid {
      NEHotspotConfigurationManager.shared.removeConfiguration(forSSID: ssid)
    }
  }
}
