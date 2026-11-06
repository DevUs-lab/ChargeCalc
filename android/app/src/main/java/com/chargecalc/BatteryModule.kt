
package com.chargecalc

import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.content.Context
import com.facebook.react.bridge.*
import com.facebook.react.ReactPackage
import com.facebook.react.uimanager.ViewManager
import java.io.File

class BatteryModule(private val context: ReactApplicationContext) :
    ReactContextBaseJavaModule(context) {

    override fun getName() = "BatteryModule"

    private fun readSysfs(path: String): Long? {
        return try {
            File(path).readText().trim().toLongOrNull()
        } catch (_: Exception) {
            null
        }
    }

    /**
     * Reads the first positive value of [fileName] found across every
     * /sys/class/power_supply node. Manufacturers expose battery data under
     * different node names (battery, bms, main, ...), so we scan them all
     * instead of hard-coding one. Falls back to a list of common node names if
     * the directory can't be listed.
     */
    private fun readFirstSysfs(fileName: String): Long? {
        val dir = File("/sys/class/power_supply")
        val nodes = dir.listFiles()?.toList()
            ?: listOf("battery", "bms", "main", "bms-llk", "battery-cc", "bm")
                .map { File("/sys/class/power_supply/$it") }
        for (node in nodes) {
            val value = readSysfs(File(node, fileName).path)
            if (value != null && value > 0) return value
        }
        return null
    }

    @ReactMethod
    fun getBatteryInfo(promise: Promise) {
        try {
            val manager = context.getSystemService(Context.BATTERY_SERVICE)
                as BatteryManager

            val filter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
            val batteryIntent = context.registerReceiver(null, filter)

            if (batteryIntent == null) {
                promise.reject("BATTERY_ERROR", "Battery information unavailable")
                return
            }

            val level = batteryIntent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
            val scale = batteryIntent.getIntExtra(BatteryManager.EXTRA_SCALE, 100)

            val percentage = if (level >= 0 && scale > 0) {
                (level * 100) / scale
            } else {
                -1
            }

            val status = when (
                batteryIntent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
            ) {
                BatteryManager.BATTERY_STATUS_CHARGING -> "Charging"
                BatteryManager.BATTERY_STATUS_FULL -> "Full"
                BatteryManager.BATTERY_STATUS_DISCHARGING -> "Discharging"
                BatteryManager.BATTERY_STATUS_NOT_CHARGING -> "Not charging"
                else -> "Unknown"
            }

            val plugged = when (
                batteryIntent.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0)
            ) {
                BatteryManager.BATTERY_PLUGGED_USB -> "USB"
                BatteryManager.BATTERY_PLUGGED_AC -> "AC"
                BatteryManager.BATTERY_PLUGGED_WIRELESS -> "Wireless"
                else -> "None"
            }

            val health = when (
                batteryIntent.getIntExtra(BatteryManager.EXTRA_HEALTH, -1)
            ) {
                BatteryManager.BATTERY_HEALTH_GOOD -> "Good"
                BatteryManager.BATTERY_HEALTH_OVERHEAT -> "Overheating"
                BatteryManager.BATTERY_HEALTH_DEAD -> "Dead"
                BatteryManager.BATTERY_HEALTH_OVER_VOLTAGE -> "Over voltage"
                BatteryManager.BATTERY_HEALTH_COLD -> "Cold"
                else -> "Unknown"
            }

            val temperature =
                batteryIntent.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, -1)

            val voltage =
                batteryIntent.getIntExtra(BatteryManager.EXTRA_VOLTAGE, -1)

            val chargeCounterApi =
                manager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CHARGE_COUNTER)

            val currentNow =
                manager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CURRENT_NOW)

            val map = Arguments.createMap()

            map.putInt("level", percentage)
            map.putString("status", status)
            map.putString("plugged", plugged)
            map.putString("health", health)

            if (temperature >= 0) {
                map.putDouble("temperatureC", temperature / 10.0)
            } else {
                map.putNull("temperatureC")
            }

            if (voltage > 0) {
                map.putDouble("voltageMv", voltage.toDouble())
            } else {
                map.putNull("voltageMv")
            }

            // Remaining charge (numerator): prefer the Android API, fall back to
            // sysfs charge_now so devices that don't report via the API still
            // get a real reading.
            val chargeNowUah: Long? = when {
                chargeCounterApi != Int.MIN_VALUE && chargeCounterApi >= 0 ->
                    chargeCounterApi.toLong()
                else -> readFirstSysfs("charge_now")
            }

            if (chargeNowUah != null) {
                map.putDouble("chargeCounterUah", chargeNowUah.toDouble())
            } else {
                map.putNull("chargeCounterUah")
            }

            if (currentNow != Int.MIN_VALUE) {
                map.putDouble("currentNowUa", currentNow.toDouble())
            } else {
                map.putNull("currentNowUa")
            }

            // Real full capacity (denominator): scanned across every power
            // supply node so it works on any phone that exposes it.
            val fullCapacityUah = readFirstSysfs("charge_full")

            if (fullCapacityUah != null && fullCapacityUah > 0) {
                map.putDouble("fullCapacityMah", fullCapacityUah / 1000.0)
            } else {
                map.putNull("fullCapacityMah")
            }

            // Real, precise state-of-charge (e.g. 85.34) from the actual
            // remaining charge divided by the real full capacity. Sent only when
            // both real charge readings are available; otherwise null so the UI
            // shows the honest integer instead of a fake ".00".
            val preciseLevel: Double? =
                if (chargeNowUah != null && fullCapacityUah != null && fullCapacityUah > 0) {
                    (chargeNowUah.toDouble() / fullCapacityUah.toDouble() * 100.0)
                        .coerceIn(0.0, 100.0)
                } else {
                    null
                }

            if (preciseLevel != null) {
                map.putDouble("preciseLevel", preciseLevel)
            } else {
                map.putNull("preciseLevel")
            }

            val cycles = readFirstSysfs("cycle_count")

            if (cycles != null && cycles >= 0) {
                map.putDouble("cycleCount", cycles.toDouble())
            } else {
                map.putNull("cycleCount")
            }

            promise.resolve(map)

        } catch (e: Exception) {
            promise.reject("BATTERY_ERROR", e.message, e)
        }
    }
}

class BatteryPackage : ReactPackage {
    override fun createNativeModules(
        reactContext: ReactApplicationContext
    ): List<NativeModule> {
        return listOf(BatteryModule(reactContext))
    }

    override fun createViewManagers(
        reactContext: ReactApplicationContext
    ): List<ViewManager<*, *>> {
        return emptyList()
    }
}
