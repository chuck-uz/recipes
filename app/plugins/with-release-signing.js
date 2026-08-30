/**
 * Expo по умолчанию подписывает релизную сборку отладочным ключом.
 * Плагин заменяет это на настоящий ключ, читаемый из свойств Gradle.
 *
 * Свойства не заданы — сборка молча остаётся на отладочном ключе, чтобы
 * локальный `expo prebuild` работал без секретов. В CI они передаются
 * через -P, и подпись становится релизной.
 */
const { withAppBuildGradle } = require('expo/config-plugins')

const RELEASE_SIGNING = `    signingConfigs {
        release {
            storeFile file(findProperty('RECIPES_STORE_FILE') ?: 'debug.keystore')
            storePassword findProperty('RECIPES_STORE_PASSWORD') ?: 'android'
            keyAlias findProperty('RECIPES_KEY_ALIAS') ?: 'androiddebugkey'
            keyPassword findProperty('RECIPES_KEY_PASSWORD') ?: 'android'
        }
`

const DEBUG_IN_RELEASE = `            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug`

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (gradleConfig) => {
    let contents = gradleConfig.modResults.contents

    if (!contents.includes('    signingConfigs {\n')) {
      throw new Error('Шаблон build.gradle изменился: не найден блок signingConfigs')
    }
    if (!contents.includes(DEBUG_IN_RELEASE)) {
      throw new Error('Шаблон build.gradle изменился: релизная сборка больше не ссылается на отладочный ключ')
    }

    contents = contents.replace('    signingConfigs {\n', RELEASE_SIGNING)
    contents = contents.replace(DEBUG_IN_RELEASE, '            signingConfig signingConfigs.release')

    gradleConfig.modResults.contents = contents
    return gradleConfig
  })
}
