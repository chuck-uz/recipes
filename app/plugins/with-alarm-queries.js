/**
 * С Android 11 приложение по умолчанию не «видит» чужие приложения.
 * Чтобы система пустила интент к штатным «Часам», нужно объявить,
 * что именно мы ищем.
 */
const { withAndroidManifest } = require('expo/config-plugins')

const ACTIONS = ['android.intent.action.SET_TIMER', 'android.intent.action.SHOW_TIMERS']

module.exports = function withAlarmQueries(config) {
  return withAndroidManifest(config, (manifestConfig) => {
    const manifest = manifestConfig.modResults.manifest
    manifest.queries = manifest.queries ?? []

    const first = manifest.queries[0] ?? {}
    manifest.queries[0] = first
    first.intent = first.intent ?? []

    for (const action of ACTIONS) {
      const declared = first.intent.some(
        (entry) => entry.action?.[0]?.$?.['android:name'] === action,
      )
      if (!declared) {
        first.intent.push({ action: [{ $: { 'android:name': action } }] })
      }
    }

    return manifestConfig
  })
}
