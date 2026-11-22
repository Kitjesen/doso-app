package com.oney.WebRTCModule;

import androidx.annotation.Nullable;

import com.facebook.react.bridge.ReactContext;

import org.webrtc.MediaStream;
import org.webrtc.MediaStreamTrack;
import org.webrtc.VideoTrack;

import java.util.concurrent.TimeUnit;

public final class DosoWebRtcTrackLookup {
    private DosoWebRtcTrackLookup() {}

    @Nullable
    public static VideoTrack resolveVideoTrack(
            ReactContext reactContext,
            int peerConnectionId,
            @Nullable String trackId,
            @Nullable String streamReactTag
    ) throws Exception {
        WebRTCModule module = reactContext.getNativeModule(WebRTCModule.class);
        if (module == null) {
            return null;
        }
        return ThreadUtils.submitToExecutor(() -> {
            if (trackId != null && !trackId.isEmpty()) {
                MediaStreamTrack track = module.getTrack(peerConnectionId, trackId);
                if (track instanceof VideoTrack) {
                    return (VideoTrack) track;
                }
            }
            if (streamReactTag != null && !streamReactTag.isEmpty()) {
                MediaStream stream = module.getStreamForReactTag(streamReactTag);
                if (stream != null && !stream.videoTracks.isEmpty()) {
                    return stream.videoTracks.get(0);
                }
            }
            return null;
        }).get(2, TimeUnit.SECONDS);
    }
}
