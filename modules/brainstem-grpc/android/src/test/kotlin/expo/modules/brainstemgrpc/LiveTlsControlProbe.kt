package expo.modules.brainstemgrpc

import android.os.SystemClock
import io.grpc.okhttp.OkHttpChannelBuilder
import io.grpc.CallOptions
import io.grpc.Channel
import io.grpc.ClientCall
import io.grpc.ClientInterceptor
import io.grpc.ForwardingClientCall
import io.grpc.ForwardingClientCallListener
import io.grpc.Metadata
import io.grpc.MethodDescriptor
import io.grpc.Status
import java.io.File
import java.security.KeyStore
import java.security.SecureRandom
import java.security.cert.CertificateFactory
import java.util.concurrent.Executors
import javax.net.ssl.KeyManagerFactory
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManagerFactory

/** JVM wire/TLS integration fixture, never packaged into the Android application. */
fun main(args: Array<String>) {
  val directory = File(args[0])
  val port = args[1].toInt()
  val scenario = args[2]
  val trust = KeyStore.getInstance(KeyStore.getDefaultType()).apply { load(null, null) }
  val ca = if (scenario == "unknown-ca") "rogue-ca" else "ca"
  trust.setCertificateEntry("fixture-root", File(directory, "$ca.pem").inputStream().use {
    CertificateFactory.getInstance("X.509").generateCertificate(it)
  })
  val tm = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).apply { init(trust) }
  val keyManagers = if (scenario == "no-client") null else {
    val identity = when (scenario) { "unmapped" -> "unmapped"; "rogue-client" -> "rogue-client"; "expired-client" -> "expired-client"; else -> "client" }
    val keys = KeyStore.getInstance("PKCS12").apply {
      File(directory, "$identity.p12").inputStream().use { load(it, charArrayOf()) }
    }
    KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm()).apply { init(keys, charArrayOf()) }.keyManagers
  }
  val tls = SSLContext.getInstance("TLS").apply { init(keyManagers, tm.trustManagers, SecureRandom()) }
  val observed = mutableListOf<String>()
  val diagnostics = object : ClientInterceptor {
    override fun <ReqT : Any?, RespT : Any?> interceptCall(method: MethodDescriptor<ReqT, RespT>,
      options: CallOptions, next: Channel): ClientCall<ReqT, RespT> =
      object : ForwardingClientCall.SimpleForwardingClientCall<ReqT, RespT>(next.newCall(method, options)) {
        override fun start(listener: Listener<RespT>, headers: Metadata) {
          super.start(object : ForwardingClientCallListener.SimpleForwardingClientCallListener<RespT>(listener) {
            override fun onClose(status: Status, trailers: Metadata) {
              observed.add("${method.bareMethodName}:${status.code}:${status.cause?.javaClass?.simpleName ?: "none"}:${status.description?.take(200)}:${status.cause?.stackTraceToString()?.take(3000)}")
              super.onClose(status, trailers)
            }
          }, headers)
        }
      }
  }
  // Real grpc-okhttp HTTP/2 transport, normal hostname verification, no plaintext or trust bypass.
  val channel = OkHttpChannelBuilder.forAddress("127.0.0.1", port).useTransportSecurity()
    .sslSocketFactory(tls.socketFactory).intercept(diagnostics).disableRetry().build()
  val cleanup = Executors.newSingleThreadExecutor()
  val session = ControlSession(channel, "fixture-client@robot") { cleanup.execute(it) }
  fun failure(expected: String, operation: () -> Unit) {
    try { operation(); error("Expected fixture failure: $expected") }
    catch (error: ControlSession.Failure) { check(error.code == expected) { "Expected $expected, got ${error.code}" } }
  }
  try {
    if (scenario in listOf("unknown-ca", "wrong-san", "no-client", "rogue-client", "expired-client")) {
      failure("unavailable") { session.initialStatus() }
    } else {
      val initial = session.initialStatus()
      check(initial["principalVerified"] == false)
      val status = initial["status"] as Map<*, *>
      check(status["fsmKind"] == "standing" && status["motorOutputEnabled"] == true)
      val profile = initial["profile"] as Map<*, *>
      check(profile["current"] == "fixture-standing")
      check(profile["available"] == listOf("fixture-standing", "fixture-grounded"))
      if (scenario == "unmapped") {
        failure("unauthorized") { session.acquire() }
      } else {
        val acquired = session.acquire()
        check(acquired["sequence"] == 1L && acquired["leaseActive"] == true)
        check(acquired["principalVerified"] == true)
        when (scenario) {
          "lost-ack" -> {
            failure("unavailable") { session.input(.1, 0.0, 0.0, SystemClock.elapsedRealtime()) }
            failure("not_armed") { session.input(.1, 0.0, 0.0, SystemClock.elapsedRealtime()) }
          }
          "lost-release" -> {
            session.haltImmediately()
            failure("stop_unconfirmed") { session.interrupt() }
            failure("busy") { session.acquire() }
          }
          else -> {
            check(session.input(.1, -.1, .2, SystemClock.elapsedRealtime())["sequence"] == 2L)
            val staleEpoch = session.captureEpoch()
            session.haltImmediately()
            failure("cancelled") { session.input(.1, 0.0, 0.0, SystemClock.elapsedRealtime(), staleEpoch) }
            check(session.interrupt()["leaseActive"] == false)
          }
        }
      }
    }
    println("PASS: real TLS/HTTP2 ControlSession $scenario")
  } catch (error: Exception) {
    System.err.println("Fixture transport diagnostics: $scenario ${observed.joinToString(";")}")
    if (error is ControlSession.Failure) System.err.println("ControlSession failure: ${error.code}")
    throw error
  } finally {
    session.close()
    cleanup.shutdownNow()
  }
}
