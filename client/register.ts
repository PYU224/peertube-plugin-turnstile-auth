interface RegisterClientOptions {
  peertubeHelpers: any
  registerHook: any
  getSettings: () => Promise<any>
}

async function register({ peertubeHelpers, registerHook, getSettings }: RegisterClientOptions) {
  const settings = await getSettings()
  
  // Turnstileが有効でサイトキーが設定されている場合のみ
  if (!settings['turnstile-enabled'] || !settings['turnstile-site-key']) {
    return
  }

  const siteKey = settings['turnstile-site-key']

  // Turnstileスクリプトを読み込む
  loadTurnstileScript()

  // 登録フォームが表示されたときのフック
  registerHook({
    target: 'action:signup.register.init',
    handler: () => {
      setTimeout(() => {
        injectTurnstileWidget(siteKey)
      }, 100)
    }
  })

  // フォーム送信前のフック
  registerHook({
    target: 'filter:api.signup.registration.create.params',
    handler: (params: any) => {
      const turnstileResponse = (window as any).turnstile?.getResponse()
      
      if (!turnstileResponse) {
        peertubeHelpers.notifier.error('Please complete the Turnstile verification')
        throw new Error('Turnstile verification required')
      }

      // パラメータにTurnstileトークンを追加
      return {
        ...params,
        turnstileToken: turnstileResponse
      }
    }
  })
}

function loadTurnstileScript() {
  if (document.getElementById('turnstile-script')) {
    return
  }

  const script = document.createElement('script')
  script.id = 'turnstile-script'
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
  script.async = true
  script.defer = true
  document.head.appendChild(script)
}

function injectTurnstileWidget(siteKey: string) {
  // 登録フォームを探す
  const form = document.querySelector('.signup-form, form[name="form"]')
  if (!form) {
    console.error('Registration form not found')
    return
  }

  // すでにウィジェットが存在する場合はスキップ
  if (document.getElementById('turnstile-widget')) {
    return
  }

  // Turnstileウィジェット用のコンテナを作成
  const container = document.createElement('div')
  container.id = 'turnstile-widget-container'
  container.className = 'turnstile-widget-container'
  container.innerHTML = `
    <div class="form-group">
      <label>Security Verification</label>
      <div id="turnstile-widget"></div>
    </div>
  `

  // サブミットボタンの前に挿入
  const submitButton = form.querySelector('input[type="submit"], button[type="submit"]')
  if (submitButton && submitButton.parentElement) {
    submitButton.parentElement.insertBefore(container, submitButton)
  } else {
    form.appendChild(container)
  }

  // Turnstileウィジェットをレンダリング
  if ((window as any).turnstile) {
    (window as any).turnstile.render('#turnstile-widget', {
      sitekey: siteKey,
      callback: function(token: string) {
        console.log('Turnstile verification successful')
      },
      'error-callback': function() {
        console.error('Turnstile verification failed')
      }
    })
  } else {
    // スクリプトがまだ読み込まれていない場合は待機
    setTimeout(() => injectTurnstileWidget(siteKey), 500)
  }
}

export {
  register
}