package com.streamcore.tv;
import android.app.Activity;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.SurfaceView;
import android.view.View;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector;

public class PlayerActivity extends Activity {
    private ExoPlayer player;
    private boolean isLive;
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_FULLSCREEN|View.SYSTEM_UI_FLAG_HIDE_NAVIGATION|View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        setContentView(R.layout.activity_player);
        String url = getIntent().getStringExtra("url");
        isLive = getIntent().getBooleanExtra("isLive", false);
        SurfaceView sv = findViewById(R.id.surface_view);
        DefaultTrackSelector ts = new DefaultTrackSelector(this);
        ts.setParameters(ts.buildUponParameters().setForceHighestSupportedBitrate(true).setTunnelingEnabled(true).build());
        DefaultLoadControl lc = isLive ?
            new DefaultLoadControl.Builder().setBufferDurationsMs(2000,5000,1000,1000).build() :
            new DefaultLoadControl.Builder().setBufferDurationsMs(15000,60000,2500,2000).build();
        AudioAttributes aa = new AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build();
        player = new ExoPlayer.Builder(this)
            .setTrackSelector(ts).setLoadControl(lc)
            .setAudioAttributes(aa, true).build();
        player.setVideoSurfaceView(sv);
        player.setMediaItem(MediaItem.fromUri(url));
        player.setPlayWhenReady(true);
        player.prepare();
        player.addListener(new Player.Listener() {
            public void onPlaybackStateChanged(int s) { if(s==Player.STATE_ENDED) finish(); }
            public void onPlayerError(androidx.media3.common.PlaybackException e) { player.prepare(); player.play(); }
        });
    }
    @Override
    public boolean onKeyDown(int k, KeyEvent e) {
        if(k==KeyEvent.KEYCODE_BACK){finish();return true;}
        if(k==KeyEvent.KEYCODE_DPAD_CENTER||k==KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE){
            if(player!=null){if(player.isPlaying())player.pause();else player.play();}return true;}
        if(k==KeyEvent.KEYCODE_DPAD_RIGHT){if(player!=null&&!isLive)player.seekTo(player.getCurrentPosition()+10000);return true;}
        if(k==KeyEvent.KEYCODE_DPAD_LEFT){if(player!=null&&!isLive)player.seekTo(Math.max(0,player.getCurrentPosition()-10000));return true;}
        return super.onKeyDown(k,e);
    }
    @Override protected void onPause(){super.onPause();if(player!=null)player.pause();}
    @Override protected void onStop(){super.onStop();if(player!=null){player.stop();player.release();player=null;}}
}
