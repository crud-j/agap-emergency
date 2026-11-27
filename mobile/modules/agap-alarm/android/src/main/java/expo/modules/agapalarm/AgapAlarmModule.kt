package expo.modules.agapalarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * MOD-32: a new assignment that keeps ringing and vibrating until the responder looks at
 * it, even with AGAP closed. Android's "insistent" flag repeats the channel's sound and
 * vibration until the notification is opened, swiped away, replaced or cancelled.
 * expo-notifications cannot set that flag, hence this module. Posted with the same tag
 * and id (0) as the push itself, so it replaces it, and a later push with that tag (a
 * repeat, or the cancellation) replaces it in turn.
 */
class AgapAlarmModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AgapAlarm")

    Function("ring") { tag: String, title: String, body: String, url: String ->
      ring(tag, title, body, url)
    }

    Function("stop") { tag: String ->
      val context = appContext.reactContext ?: return@Function false
      try {
        manager(context).cancel(tag, NOTIFY_ID)
        true
      } catch (e: Exception) {
        Log.w(TAG, "stop failed: ${e.message}")
        false
      }
    }
  }

  private fun manager(context: Context) =
    context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  private fun ring(tag: String, title: String, body: String, url: String): Boolean {
    val context = appContext.reactContext ?: return false
    // Below Android 8 there are no channels: the push AGAP already showed stays.
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
    return try {
      val nm = manager(context)
      if (!nm.areNotificationsEnabled()) return false
      ensureChannel(nm)

      val open = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
        setPackage(context.packageName)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      }
      val contentIntent = PendingIntent.getActivity(
        context,
        tag.hashCode(),
        open,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )

      val notification = Notification.Builder(context, CHANNEL_ID)
        .setSmallIcon(smallIcon(context))
        .setContentTitle(title)
        .setContentText(body)
        .setStyle(Notification.BigTextStyle().bigText(body))
        .setCategory(Notification.CATEGORY_ALARM)
        .setVisibility(Notification.VISIBILITY_PUBLIC)
        .setContentIntent(contentIntent)
        .setAutoCancel(true)
        // A safety stop if the server's repeats and the cancellation never arrive.
        .setTimeoutAfter(RING_TIMEOUT_MS)
        .build()
      notification.flags = notification.flags or Notification.FLAG_INSISTENT

      nm.notify(tag, NOTIFY_ID, notification)
      true
    } catch (e: Exception) {
      Log.w(TAG, "ring failed: ${e.message}")
      false
    }
  }

  /** Alarm sound at alarm volume, long vibration, lock screen, through Do Not Disturb where allowed. */
  private fun ensureChannel(nm: NotificationManager) {
    if (nm.getNotificationChannel(CHANNEL_ID) != null) return
    val sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
      ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
      ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
    val channel = NotificationChannel(CHANNEL_ID, "New assignment (ringing)", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "Rings and vibrates for a new assignment until you open it."
      enableVibration(true)
      vibrationPattern = longArrayOf(0, 1000, 500, 1000, 500)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      setBypassDnd(true)
      setSound(
        sound,
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ALARM)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build(),
      )
    }
    nm.createNotificationChannel(channel)
  }

  /** The notification icon expo-notifications uses, else the app icon. */
  private fun smallIcon(context: Context): Int {
    return try {
      val info = context.packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
      val meta = info.metaData
      if (meta != null && meta.containsKey(EXPO_ICON_META)) meta.getInt(EXPO_ICON_META) else info.icon
    } catch (e: Exception) {
      context.applicationInfo.icon
    }
  }

  companion object {
    private const val TAG = "AgapAlarm"
    /** Android fixes a channel's sound and vibration once created: a change needs a new id. */
    const val CHANNEL_ID = "assignments-ring"
    /** expo-notifications posts pushes with id 0 and the push's tag. */
    const val NOTIFY_ID = 0
    const val RING_TIMEOUT_MS = 5 * 60_000L
    private const val EXPO_ICON_META = "expo.modules.notifications.default_notification_icon"
  }
}
