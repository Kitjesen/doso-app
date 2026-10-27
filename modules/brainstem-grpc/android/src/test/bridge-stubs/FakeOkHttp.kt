package io.grpc.okhttp

import expo.modules.brainstemgrpc.ModuleTestTransport
import io.grpc.ManagedChannel
import javax.net.ssl.SSLSocketFactory

class OkHttpChannelBuilder private constructor(private val host: String, private val port: Int) {
  private var factory: SSLSocketFactory? = null
  companion object { @JvmStatic fun forAddress(host: String, port: Int) = OkHttpChannelBuilder(host, port) }
  fun useTransportSecurity() = this
  fun usePlaintext() = this
  fun sslSocketFactory(factory: SSLSocketFactory): OkHttpChannelBuilder { this.factory = factory; return this }
  fun maxInboundMessageSize(size: Int) = this
  fun maxInboundMetadataSize(size: Int) = this
  fun disableRetry() = this
  fun build(): ManagedChannel = ModuleTestTransport.channel(host, port, factory)
}
