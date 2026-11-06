
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  StatusBar,
  NativeModules,
} from 'react-native';

const { BatteryModule } = NativeModules;

const format = (value, digits = 1) =>
  value == null || !Number.isFinite(value)
    ? 'Unavailable'
    : Number(value).toFixed(digits);

const pad2 = n => String(Math.floor(n)).padStart(2, '0');

// Formats an elapsed duration in ms as H:MM:SS (or MM:SS under an hour).
const formatDuration = ms => {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '--';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
};

// Formats a timestamp as a short wall-clock time, e.g. "14:32". Uses plain
// getHours/getMinutes (no Intl) so it works reliably on Hermes.
const formatClock = ts => {
  if (ts == null || !Number.isFinite(ts)) return '--';
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

const MetricCard = ({ title, value, subtitle, wide = false }) => (
  <View style={[styles.card, wide && styles.wideCard]}>
    <Text style={styles.cardTitle}>{title}</Text>
    <Text style={styles.cardValue}>{value}</Text>
    {!!subtitle && <Text style={styles.cardSubtitle}>{subtitle}</Text>}
  </View>
);

export default function App() {
  const [battery, setBattery] = useState(null);
  const [error, setError] = useState('');
  const [speed, setSpeed] = useState(null);
  const [timeToFull, setTimeToFull] = useState(null);
  const samples = useRef([]);

  // Charging session timer: when charging starts we record the plug-in time
  // and count up; when it stops we freeze the total so the user sees how long
  // that session took.
  const [chargingSince, setChargingSince] = useState(null);
  const [chargeSessionStart, setChargeSessionStart] = useState(null);
  const [chargeSessionMs, setChargeSessionMs] = useState(null);
  const [, setTick] = useState(0);
  const chargingSinceRef = useRef(null);
  const chargeSessionStartRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    const loadBattery = async () => {
      try {
        if (!BatteryModule) {
          throw new Error('Native BatteryModule is not installed.');
        }

        const data = await BatteryModule.getBatteryInfo();

        if (!mounted) return;

        setBattery(data);
        setError('');

        // Keep recent real percentage readings for rate calculation.
        const now = Date.now();

        // Start the charging timer when the status enters "Charging", and
        // freeze it (recording the total) when it leaves, so the user can see
        // how long the last charge session took.
        const isCharging = data.status === 'Charging';
        if (isCharging) {
          if (chargingSinceRef.current == null) {
            chargingSinceRef.current = now;
            chargeSessionStartRef.current = now;
            setChargingSince(now);
            setChargeSessionStart(now);
            setChargeSessionMs(null);
          }
        } else if (chargingSinceRef.current != null) {
          setChargeSessionMs(now - chargingSinceRef.current);
          chargingSinceRef.current = null;
          setChargingSince(null);
        }
        samples.current = [
          ...samples.current,
          { level: data.level, time: now },
        ].filter(item => now - item.time <= 5 * 60 * 1000);

        const first = samples.current[0];
        const elapsedMinutes = first
          ? (now - first.time) / 60000
          : 0;

        if (first && elapsedMinutes >= 1) {
          const change = data.level - first.level;
          const hourlyRate = (change / elapsedMinutes) * 60;

          if (data.status === 'Charging' && hourlyRate > 0) {
            setSpeed(hourlyRate);
            setTimeToFull(
              data.level < 100 ? (100 - data.level) / hourlyRate : 0,
            );
          } else {
            setSpeed(null);
            setTimeToFull(null);
          }
        }
      } catch (e) {
        if (mounted) setError(e.message || 'Unable to read battery.');
      }
    };

    loadBattery();
    const timer = setInterval(loadBattery, 2000);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  // Re-render once per second while charging so the live timer counts up.
  useEffect(() => {
    if (chargingSince == null) return;
    const id = setInterval(() => setTick(t => (t + 1) % 1000000), 1000);
    return () => clearInterval(id);
  }, [chargingSince]);

  const currentA =
    battery?.currentNowUa != null
      ? Math.abs(battery.currentNowUa) / 1000000
      : null;

  // Live elapsed time while charging, or the frozen total of the last session.
  const isChargingNow = chargingSince != null;
  const chargeElapsedMs = isChargingNow
    ? Date.now() - chargingSince
    : chargeSessionMs;

  const voltageV =
    battery?.voltageMv != null ? battery.voltageMv / 1000 : null;

  const powerW =
    currentA != null && voltageV != null
      ? currentA * voltageV
      : null;

  const etaText =
    timeToFull == null
      ? 'Collecting readings'
      : timeToFull === 0
        ? 'Fully charged'
        : `${Math.floor(timeToFull)}h ${Math.round(
          (timeToFull % 1) * 60,
        )}m`;

  const source =
    battery?.plugged === 'USB'
      ? 'USB'
      : battery?.plugged === 'AC'
        ? 'AC charger'
        : battery?.plugged === 'Wireless'
          ? 'Wireless'
          : 'Not connected';

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#090D18" />

      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.logo}>Charge<Text style={styles.logoAccent}>Calc</Text></Text>
            <Text style={styles.tagline}>Know every percent.</Text>
          </View>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <Text style={styles.cardSubtitle}>
              Check that the Kotlin module is registered and rebuild the app.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.heroCard}>
              <Text style={styles.eyebrow}>CURRENT BATTERY LEVEL</Text>
              <View style={styles.percentageRow}>
                <Text style={styles.percentage}>
                  {battery
                    ? battery.preciseLevel != null
                      ? format(battery.preciseLevel, 2)
                      : `${battery.level}`
                    : '--'}
                </Text>
                <Text style={styles.percentSign}>%</Text>
              </View>

              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${battery?.preciseLevel ?? battery?.level ?? 0}%` },
                  ]}
                />
              </View>

              <Text style={styles.heroStatus}>
                {battery?.status ?? 'Reading battery...'}
              </Text>
              <Text style={styles.precisionNote}>
                {battery?.preciseLevel != null
                  ? 'Precise level from charge counter (real decimal reading)'
                  : 'Android-reported percentage (precise data unavailable)'}
              </Text>
            </View>

            <Text style={styles.sectionTitle}>CHARGING SESSION</Text>
            <View style={styles.sessionCard}>
              <View style={styles.sessionHeader}>
                <Text style={styles.eyebrow}>PLUG-IN TIMER</Text>
                <View
                  style={[
                    styles.sessionPill,
                    isChargingNow && styles.sessionPillActive,
                  ]}>
                  <View
                    style={[
                      styles.sessionPillDot,
                      isChargingNow && styles.sessionPillDotActive,
                    ]}
                  />
                  <Text
                    style={[
                      styles.sessionPillText,
                      isChargingNow && styles.sessionPillTextActive,
                    ]}>
                    {isChargingNow ? 'Charging' : 'Not charging'}
                  </Text>
                </View>
              </View>

              <View style={styles.sessionTimerRow}>
                <View style={styles.sessionTimerBlock}>
                  <Text style={styles.sessionTimerLabel}>Plugged in at</Text>
                  <Text style={styles.sessionTimerValue}>
                    {formatClock(chargeSessionStart)}
                  </Text>
                </View>
                <View style={styles.sessionTimerBlock}>
                  <Text style={styles.sessionTimerLabel}>Time spent</Text>
                  <Text style={styles.sessionTimerValueBig}>
                    {formatDuration(chargeElapsedMs)}
                  </Text>
                </View>
              </View>

              <Text style={styles.sessionHint}>
                {isChargingNow
                  ? 'Timer running since the charger was connected'
                  : chargeSessionMs != null
                    ? 'Last charging session (timer stopped)'
                    : 'Plug in a charger to start the timer'}
              </Text>
            </View>

            <Text style={styles.sectionTitle}>CHARGING ANALYTICS</Text>
            <View style={styles.grid}>
              <MetricCard
                title="Battery increase"
                value={speed == null ? '--' : `${format(speed)}%`}
                subtitle="Per hour · observed"
              />
              <MetricCard
                title="Charging speed"
                value={speed == null ? '--' : `${format(speed)}%/h`}
                subtitle="Based on recent readings"
              />
              <MetricCard
                title="Time to full"
                value={etaText}
                subtitle="Estimated from observed rate"
              />
              <MetricCard
                title="Temperature"
                value={battery ? `${format(battery.temperatureC)}°C` : '--'}
                subtitle="Battery temperature"
              />
            </View>

            <Text style={styles.sectionTitle}>BATTERY DETAILS</Text>
            <View style={styles.detailsCard}>
              <Detail label="Charging status" value={battery?.status ?? '--'} />
              <Detail label="Charging source" value={source} />
              <Detail
                label="Battery health"
                value={battery?.health ?? 'Unavailable'}
              />
              <Detail
                label="Battery cycles"
                value={battery?.cycleCount ?? 'Unavailable'}
              />
              <Detail
                label="Full charge capacity"
                value={
                  battery?.fullCapacityMah != null
                    ? `${battery.fullCapacityMah} mAh`
                    : 'Unavailable'
                }
              />
              <Detail
                label="Charge counter"
                value={
                  battery?.chargeCounterUah != null
                    ? `${battery.chargeCounterUah} µAh`
                    : 'Unavailable'
                }
              />
              <Detail
                label="Voltage"
                value={voltageV == null ? 'Unavailable' : `${format(voltageV, 3)} V`}
              />
              <Detail
                label="Current"
                value={currentA == null ? 'Unavailable' : `${format(currentA, 3)} A`}
              />
              <Detail
                label="Battery power"
                value={powerW == null ? 'Unavailable' : `${format(powerW, 2)} W`}
              />
            </View>

            <Text style={styles.footer}>
              Measurements depend on the battery hardware and Android support.
              Estimates are not guaranteed.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Detail({ label, value }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{String(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#090D18' },
  container: { padding: 20, paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 25,
    marginTop: 12,
  },
  logo: { fontSize: 27, fontWeight: '800', color: '#FFFFFF' },
  logoAccent: { color: '#A3E635' },
  tagline: { color: '#8792A8', fontSize: 13, marginTop: 3 },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#17251B',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  liveDot: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: '#A3E635', marginRight: 7,
  },
  liveText: { color: '#A3E635', fontSize: 11, fontWeight: '800' },
  heroCard: {
    backgroundColor: '#151D2D',
    borderRadius: 24,
    padding: 23,
    borderWidth: 1,
    borderColor: '#263247',
    marginBottom: 28,
  },
  eyebrow: { color: '#98A5BA', fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  percentageRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 10 },
  percentage: { fontSize: 76, fontWeight: '800', color: '#FFFFFF' },
  percentSign: { fontSize: 30, fontWeight: '700', color: '#A3E635', marginTop: 13 },
  progressTrack: {
    height: 9, backgroundColor: '#293449',
    borderRadius: 10, overflow: 'hidden', marginTop: 12,
  },
  progressFill: { height: '100%', backgroundColor: '#A3E635', borderRadius: 10 },
  heroStatus: { color: '#A3E635', fontSize: 15, fontWeight: '700', marginTop: 17 },
  precisionNote: { color: '#8792A8', fontSize: 11, marginTop: 5 },
  sessionCard: {
    backgroundColor: '#151D2D',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#263247',
    marginBottom: 28,
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  sessionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C2233',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 16,
  },
  sessionPillActive: { backgroundColor: '#17251B' },
  sessionPillDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#5B6678',
    marginRight: 7,
  },
  sessionPillDotActive: { backgroundColor: '#A3E635' },
  sessionPillText: { color: '#8792A8', fontSize: 11, fontWeight: '800' },
  sessionPillTextActive: { color: '#A3E635' },
  sessionTimerRow: { flexDirection: 'row', alignItems: 'center' },
  sessionTimerBlock: { flex: 1 },
  sessionTimerLabel: { color: '#98A5BA', fontSize: 11, fontWeight: '600' },
  sessionTimerValue: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 8,
  },
  sessionTimerValueBig: {
    color: '#A3E635',
    fontSize: 28,
    fontWeight: '800',
    marginTop: 8,
  },
  sessionHint: { color: '#758198', fontSize: 11, marginTop: 16 },
  sectionTitle: {
    color: '#8792A8', fontSize: 12, fontWeight: '800',
    letterSpacing: 1.4, marginBottom: 13,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 28 },
  card: {
    width: '48%', flexGrow: 1, flexBasis: '44%',
    backgroundColor: '#151D2D', borderRadius: 18,
    padding: 16, minHeight: 112,
    borderWidth: 1, borderColor: '#263247',
  },
  wideCard: { width: '100%' },
  cardTitle: { color: '#98A5BA', fontSize: 12, fontWeight: '600' },
  cardValue: { color: '#FFFFFF', fontSize: 23, fontWeight: '800', marginTop: 12 },
  cardSubtitle: { color: '#758198', fontSize: 11, marginTop: 5 },
  detailsCard: {
    backgroundColor: '#151D2D', borderRadius: 18,
    paddingHorizontal: 16, borderWidth: 1, borderColor: '#263247',
  },
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 15,
    borderBottomWidth: 1, borderBottomColor: '#263247',
  },
  detailLabel: { color: '#98A5BA', fontSize: 13, flex: 1 },
  detailValue: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  footer: {
    color: '#68758B', fontSize: 11,
    textAlign: 'center', lineHeight: 18, marginTop: 22,
  },
  errorCard: {
    backgroundColor: '#351D27', padding: 18,
    borderRadius: 16, borderWidth: 1, borderColor: '#713044',
  },
  errorText: { color: '#FF879B', fontSize: 15, fontWeight: '700' },
});
