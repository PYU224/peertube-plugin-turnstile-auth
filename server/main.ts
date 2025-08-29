import { RegisterServerOptions, RegisterServerSettingOptions } from '@peertube/peertube-types'

interface TurnstileVerifyResponse {
  success: boolean
  challenge_ts?: string
  hostname?: string
  'error-codes'?: string[]
}

async function register({
  registerSetting,
  registerHook,
  storageManager,
  peertubeHelpers,
  settingsManager
}: RegisterServerOptions) {
  
  const logger = peertubeHelpers.logger

  // プラグイン設定の登録
  registerSetting({
    name: 'turnstile-site-key',
    label: 'Turnstile Site Key',
    type: 'input',
    descriptionHTML: 'Your Cloudflare Turnstile site key',
    private: false
  } as RegisterServerSettingOptions)

  registerSetting({
    name: 'turnstile-secret-key',
    label: 'Turnstile Secret Key',
    type: 'input-password',
    descriptionHTML: 'Your Cloudflare Turnstile secret key (keep this private!)',
    private: true
  } as RegisterServerSettingOptions)

  registerSetting({
    name: 'turnstile-enabled',
    label: 'Enable Turnstile',
    type: 'input-checkbox',
    descriptionHTML: 'Enable or disable Turnstile verification',
    default: true,
    private: false
  } as RegisterServerSettingOptions)

  // settingsManagerを変数に保存してフック内で使用
  const getSettings = settingsManager.getSettings.bind(settingsManager)

  // 登録前のフックを登録 - handlerの型を any に
  registerHook({
    target: 'filter:api.user.signup.allowed.result',
    handler: (async (result: any, params: any) => {
      // 保存したgetSettings関数を使用
      const settings = await getSettings([
        'turnstile-enabled',
        'turnstile-secret-key'
      ])

      // Turnstileが無効の場合はスキップ
      if (!settings['turnstile-enabled']) {
        return result
      }

      const secretKey = settings['turnstile-secret-key']
      if (!secretKey || typeof secretKey !== 'string') {
        logger.error('Turnstile secret key is not configured')
        return {
          allowed: false,
          errorMessage: 'Server configuration error: Turnstile is not properly configured'
        }
      }

      // リクエストボディからTurnstileトークンを取得
      const turnstileToken = params?.body?.turnstileToken

      if (!turnstileToken) {
        return {
          allowed: false,
          errorMessage: 'Turnstile verification required'
        }
      }

      try {
        // Cloudflare APIでトークンを検証
        const verifyResponse = await verifyTurnstileToken(
          turnstileToken,
          secretKey as string,  // 型アサーション
          params?.ip
        )

        if (!verifyResponse.success) {
          logger.warn('Turnstile verification failed:', verifyResponse['error-codes'])
          return {
            allowed: false,
            errorMessage: 'Turnstile verification failed. Please try again.'
          }
        }

        // 検証成功 - 元の結果を返す
        return result

      } catch (error) {
        logger.error('Error verifying Turnstile token:', error)
        return {
          allowed: false,
          errorMessage: 'Error during verification. Please try again.'
        }
      }
    }) as any  // 型を any にキャスト
  })
}

async function unregister() {
  // クリーンアップ処理（必要に応じて）
}

// Turnstileトークンを検証する関数
async function verifyTurnstileToken(
  token: string,
  secretKey: string,
  remoteIp?: string
): Promise<TurnstileVerifyResponse> {
  const formData = new URLSearchParams()
  formData.append('secret', secretKey)
  formData.append('response', token)
  if (remoteIp) {
    formData.append('remoteip', remoteIp)
  }

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: formData
  })

  return response.json() as Promise<TurnstileVerifyResponse>
}

export {
  register,
  unregister
}