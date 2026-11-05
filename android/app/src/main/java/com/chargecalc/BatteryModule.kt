
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

            val chargeCounter =
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

            if (chargeCounter != Int.MIN_VALUE && chargeCounter >= 0) {
                map.putDouble("chargeCounterUah", chargeCounter.toDouble())
            } else {
                map.putNull("chargeCounterUah")
            }

            if (currentNow != Int.MIN_VALUE) {
                map.putDouble("currentNowUa", currentNow.toDouble())
            } else {
                map.putNull("currentNowUa")
            }

            val fullCapacity = readSysfs(
                "/sys/class/power_supply/battery/charge_full"
            )

            if (fullCapacity != null && fullCapacity > 0) {
                map.putDouble("fullCapacityMah", fullCapacity / 1000.0)
            } else {
                map.putNull("fullCapacityMah")
            }

            val cycles = readSysfs(
                "/sys/class/power_supply/battery/cycle_count"
            )

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
