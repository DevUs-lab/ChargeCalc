
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

  const currentA =
    battery?.currentNowUa != null
      ? Math.abs(battery.currentNowUa) / 1000000
      : null;

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
