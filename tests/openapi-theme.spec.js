import { test, expect } from '@playwright/test'

async function mockPanel(page, { ready = true, isConnected = () => false } = {}) {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    const body = route.request().postDataJSON() || {}
    let data = { success: true }
    if (path === '/api/bots') data.bots = []
    if (path === '/api/web-pages') data.pages = []
    if (path === '/api/openapi/menu-panel/bots') data.data = { bots: [{ appid: '10001', name: '主题测试机器人' }] }
    if (path === '/api/openapi/menu-panel/menu') data.data = { menu: { items: [{ type: 'menu', name: '更多', sub_menu_items: [{ type: 'send_message', name: '帮助', send_message: '/help' }] }] } }
    if (path === '/api/openapi/v2/status') Object.assign(data, { ready, logged_in: ready, developer_id: 'dev-test' })
    if (path === '/api/openapi/v2/start-login') data.qr_image = '/web/favicon.png'
    if (path === '/api/openapi/v2/proxy') {
      const target = body.path
      if (target === '/bopen/v2/get_audit_developer_info') data.audit_developer_info = {
        developer_info: { subject_name: '测试主体', subject_type: 2 },
        user_profile: { nick_name: '测试账号', mask_uin: '1***0001' },
        user_type: 1,
      }
      if (target === '/cgi-bin/v2/info/list_bots') Object.assign(data, {
        create_remain: 2,
        bots: [{ bot_appid: 10001, bot_name: '主题测试机器人', bot_status: 1, online_state: { online_state: 1 },
          statistics_data: { existing_groups: 9, stock_added_friends: 24 } }],
      })
      if (target === '/cgi-bin/v2/info/official/query') data.avatars = [{ avatar_id: 'avatar-1', avatar_url: '/web/favicon.png' }]
      if (target === '/cgi-bin/v2/bot/create') Object.assign(data, { create_id: 'create-test', poll_interval_ms: 500 })
      if (target === '/cgi-bin/v2/bot/create/query_result') Object.assign(data, { ret_code: 3, bot_appid: 10002, bot_secret: 'mock-secret' })
      if (target === '/cgi-bin/v2/info/query') Object.assign(data, {
        base_info: {
          bot_name: body.payload?.bot_appid === 10002 ? '接入测试机器人' : '主题测试机器人',
          bot_desc: '测试简介', bot_status: 1, online_state: { online_state: 1, links: isConnected() ? [{ link_type: 1 }] : [] },
        },
        developer_info: { subject_type: 2 },
      })
      if (target === '/cgi-bin/v2/datareport/query') Object.assign(data, {
        msg_data: [{ report_date: '20261020', up_msg_cnt: 100, up_msg_uv: 12, down_msg_cnt: 90, bot_msg_cnt: 190 }],
        group_data: [{ report_date: '20261020', existing_groups: 5, used_groups: 3 }],
        friend_data: [{ report_date: '20261020', stock_added_friends: 8, used_friends: 4 }],
        guild_data: [{ report_date: '20261020', in_guild_cnt: 2, used_guild_cnt: 1 }],
      })
      if (target === '/cgi-bin/v2/datareport/query' && body.payload.data_type >= 4) {
        const core = body.payload.data_type === 4
        data = { retcode: 0, data: { developer_metrics_data: [
          { report_date: 20261020, active_user_cnt: 20, reply_rate: 0.92 },
          { report_date: 20261021, ...(core ? {
            active_user_cnt: body.payload.data_range === 1 ? 28 : 24, active_user_cnt_chain: 20,
            up_msg: { total: 80, c2c: 30, group: 50 },
            user_profile: [{ type: 'gender', key: '女性', cnt: 12, ratio: 0.5 }],
          } : { reply_rate: 0.95, first_reply_rate: 0.93, avg_response_time: 1500, avg_rounds: 2.5 }) },
        ] } }
      }
      if (target === '/cgi-bin/v2/datareport/export') {
        data = { retcode: 0, data: '日期,活跃用户数\n2026-10-21,24' }
      }
    }
    await route.fulfill({ json: data })
  })
  // Honor reduced motion to exercise the immediate theme switch without screenshots of transitions.
  await page.emulateMedia({ reducedMotion: 'reduce' })
}

for (const width of [1440, 375]) {
  test(`开放平台跟随全局主题并保存偏好 (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await mockPanel(page)
    await page.goto('/web/openapi')
    const dashboard = page.locator('.qqdash')
    await expect(dashboard).toHaveAttribute('data-theme', 'light')
    await expect(page.locator('.bot-card')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    await page.getByTitle('切换夜间模式').click()
    await expect(dashboard).toHaveAttribute('data-theme', 'dark')
    await expect(dashboard).toHaveCSS('color-scheme', 'dark')
    await expect(dashboard).toHaveCSS('background-color', 'rgb(20, 22, 27)')
    await expect(page.locator('.bot-card')).toHaveCSS('background-color', 'rgb(28, 31, 38)')
    await page.reload()
    await expect(dashboard).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('.bot-card')).toBeVisible()

    await page.getByRole('button', { name: '创建机器人', exact: true }).click()
    await expect(page.locator('.platform-create-form')).toHaveCSS('background-color', 'rgb(28, 31, 38)')
    await expect(page.locator('.platform-create-form input')).toHaveCSS('color', 'rgb(230, 233, 239)')
    await page.locator('.platform-create-form').getByRole('button', { name: '取消' }).click()
    await page.locator('.bot-card').click()
    await expect(page.locator('.sec-group').first()).toHaveCSS('background-color', 'rgb(28, 31, 38)')
    await page.locator('.row').filter({ has: page.locator('.row-label', { hasText: '昵称' }) }).click()
    await expect(page.getByRole('dialog', { name: '设置机器人昵称' })).toHaveCSS('background-color', 'rgb(28, 31, 38)')
    await expect(page.locator('.editor-input')).toHaveCSS('color', 'rgb(230, 233, 239)')
    await page.getByRole('dialog').getByRole('button', { name: '取消' }).click()
    await page.getByRole('button', { name: '运营数据', exact: true }).click()
    await page.getByRole('button', { name: '数据明细', exact: true }).click()
    await page.getByRole('switch').click()
    await expect(page.locator('.report-line-chart').first()).toBeVisible()
    await expect(page.locator('.report-chart-grid text').first()).toHaveCSS('fill', 'rgb(152, 162, 179)')
    await page.locator('.report-chart-stage svg').first().hover({ position: { x: 80, y: 60 } })
    await expect(page.locator('.report-chart-tooltip').first()).toHaveCSS('background-color', 'rgb(28, 31, 38)')
    await page.mouse.move(0, 0)
    await page.screenshot({ path: `.cache/openapi-dark-${width}.png`, fullPage: true })

    await page.getByRole('button', { name: '功能配置', exact: true }).click()
    await expect(page.locator('.function-config')).toHaveAttribute('data-theme', 'dark')
    await page.locator('.phone-menu-strip button').first().press('Enter')
    await expect(page.locator('.phone-menu-strip button.active')).toHaveCSS('color', 'rgb(59, 123, 247)')
    await expect(page.locator('.phone-menu-strip button span').first()).toHaveCSS('color', 'rgb(230, 233, 239)')
    await page.getByTitle('切换日间模式').click()
    await expect(page.locator('.function-config')).toHaveAttribute('data-theme', 'light')
    await page.getByRole('button', { name: '开放平台', exact: true }).click()
    await expect(dashboard).toHaveAttribute('data-theme', 'light')
    await expect(dashboard).toHaveCSS('background-color', 'rgb(244, 246, 251)')
    await expect(page.locator('.report-chart-grid text').first()).toHaveCSS('fill', 'rgb(151, 161, 176)')
  })
}

test('已有夜间偏好下的授权页面和扫码弹窗', async ({ page }) => {
  await mockPanel(page, { ready: false })
  await page.addInitScript(() => {
    localStorage.setItem('elaina_dark', '1')
    localStorage.setItem('elaina_theme', 'midnight')
  })
  await page.goto('/web/openapi')
  await expect(page.locator('.v2-gate')).toHaveCSS('background-color', 'rgb(28, 31, 38)')
  await expect(page.getByRole('button', { name: '使用 QQ 扫码登录' })).toHaveCSS('background-color', 'rgb(124, 92, 246)')
  await page.getByRole('button', { name: '使用 QQ 扫码登录' }).click()
  await expect(page.locator('.login-dialog-progress span.active')).toHaveCSS('color', 'rgb(124, 92, 246)')
  await expect(page.locator('.login-dialog')).toHaveCSS('background-color', 'rgb(28, 31, 38)')
  await expect(page.locator('.login-dialog-qr-image')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await page.screenshot({ path: '.cache/openapi-dark-login.png', fullPage: true })
})

test('手机 QQ 授权链接过期后可重新获取并完成登录', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockPanel(page, { ready: false })
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async text => { window.copiedLoginLink = text } },
    })
  })
  let starts = 0
  let confirmed = false
  let ready = false
  const authUrl = id => `https://q.qq.com/qqbot/openclaw/entity-picker.html?session_id=${id}&_wv=16777218`
  await page.route('**/api/openapi/v2/status', route => route.fulfill({
    json: { success: true, ready, logged_in: ready, developer_id: 'dev-test' },
  }))
  await page.route('**/api/openapi/v2/start-login', async route => {
    expect(route.request().postDataJSON()).toMatchObject({ method: 'mobile' })
    starts += 1
    await route.fulfill({ json: { success: true, login_id: `login-${starts}`, login_url: authUrl(starts) } })
  })
  await page.route('**/api/openapi/v2/check-login', async route => {
    expect(route.request().postDataJSON()).toMatchObject({ login_id: `login-${starts}` })
    ready = confirmed
    const status = starts === 1 ? 'expired' : confirmed ? 'logged_in' : 'scanned'
    await route.fulfill({ json: { success: true, status } })
  })

  await page.goto('/web/openapi')
  await page.getByRole('button', { name: '在手机 QQ 中授权' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('link', { name: '打开手机 QQ' })).toHaveAttribute('href', authUrl(1))
  await expect(dialog.getByRole('img', { name: '登录二维码' })).toHaveCount(0)
  await dialog.getByRole('button', { name: '重新获取授权链接' }).click()
  await expect(dialog.getByRole('link', { name: '打开手机 QQ' })).toHaveAttribute('href', authUrl(2))
  await dialog.getByRole('button', { name: '复制授权链接' }).click()
  expect(await page.evaluate(() => window.copiedLoginLink)).toBe(authUrl(2))
  await expect(dialog.getByText('请在手机 QQ 中选择主体并确认')).toBeVisible()
  confirmed = true
  await expect(page.getByText('主题测试机器人', { exact: true })).toBeVisible()
  await expect(dialog).toHaveCount(0)
})

test('机器人管理侧栏显示新版运营数据，支持独立筛选、趋势图和下载', async ({ page }) => {
  await mockPanel(page)
  await page.goto('/web/openapi')
  await expect(page.getByRole('heading', { name: '我的机器人' })).toBeVisible()
  await page.locator('.bot-card').click()
  const nav = page.getByRole('navigation', { name: '机器人管理栏目' })
  const item = nav.getByRole('button', { name: '运营数据', exact: true })
  await item.click()
  await expect(item).toHaveAttribute('aria-current', 'page')
  const core = page.getByRole('region', { name: '核心数据' })
  const quality = page.getByRole('region', { name: '互动质量' })
  await expect(core.getByText('24', { exact: true })).toBeVisible()
  const gender = page.getByRole('region', { name: '用户画像' }).getByRole('button', { name: '女性 50.0% · 12' })
  await expect(gender).toBeVisible()
  await gender.hover()
  await expect(page.locator('.distribution-donut .distribution-tooltip')).toContainText('50.0% · 12')
  await expect(quality.getByText('95.0%')).toBeVisible()
  await expect(quality.getByText('1.5秒')).toBeVisible()
  await core.getByRole('button', { name: '最近 14 天' }).click()
  await expect(core.getByText('28', { exact: true })).toBeVisible()
  await expect(quality.getByRole('button', { name: '最近 7 天' })).toHaveAttribute('aria-pressed', 'true')
  await core.getByRole('button', { name: '显示趋势图' }).click()
  const sparkline = core.getByRole('img', { name: '活跃用户数趋势图' })
  await expect(sparkline).toBeVisible()
  await expect(sparkline.locator('.report-chart-line')).toHaveCSS('stroke-dasharray', 'none')
  await sparkline.focus()
  await sparkline.press('ArrowLeft')
  await expect(core.locator('.report-chart-tooltip')).toContainText('10-20')
  const downloaded = page.waitForEvent('download')
  await core.getByRole('button', { name: '下载数据' }).click()
  expect((await downloaded).suggestedFilename()).toBe('核心数据.csv')
  await page.getByRole('button', { name: '数据明细', exact: true }).click()
  await expect(page.getByText('消息数据', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '返回运营数据' }).click()
  await expect(core.getByText('24', { exact: true })).toBeVisible()
})

test('开放平台保留右下角切换，创建机器人后检查服务连接', async ({ page }) => {
  let connected = false
  await mockPanel(page, { isConnected: () => connected })
  await page.goto('/web/openapi')
  await expect(page.getByRole('complementary', { name: 'QQ 机器人管理端' })).toHaveCount(0)
  const switcher = page.getByRole('navigation', { name: '开放平台页面切换' })
  await expect(switcher).toHaveCSS('position', 'fixed')
  await expect(switcher.getByRole('button', { name: '功能配置' })).toBeVisible()
  await page.getByLabel('打开用户菜单').click()
  await expect(page.getByText('测试账号', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '切换主体' })).toBeVisible()
  await page.getByLabel('打开用户菜单').click()
  await expect(page.locator('.bot-card')).toContainText('累计进群 9')
  await page.getByRole('button', { name: '创建机器人', exact: true }).click()
  await page.getByPlaceholder('为机器人起一个名字').fill('接入测试机器人')
  await page.getByRole('button', { name: '返回机器人列表' }).click()
  await page.getByRole('button', { name: '继续填写' }).click()
  await expect(page.getByPlaceholder('为机器人起一个名字')).toHaveValue('接入测试机器人')
  await page.getByRole('button', { name: '创建机器人', exact: true }).click()
  await expect(page.getByRole('heading', { name: '设置 AI 服务' })).toBeVisible()
  await expect(page.getByText('AppID 10002')).toBeVisible()
  await page.getByRole('button', { name: '我已连接' }).click()
  await expect(page.getByText('暂未检测到连接', { exact: false })).toBeVisible()
  await expect(page.getByRole('heading', { name: '设置 AI 服务' })).toBeVisible()
  connected = true
  await page.getByRole('button', { name: '我已连接' }).click()
  await expect(page.getByRole('heading', { name: '我的机器人' })).toBeVisible()
  await page.locator('.bot-card').click()
  await expect(page.getByRole('button', { name: '账号信息' })).toHaveAttribute('aria-current', 'page')
  await page.getByRole('button', { name: '服务范围' }).click()
  await expect(page.getByText('好友（私聊）', { exact: true })).toBeVisible()
  await expect(page.getByText('隐私与安全', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '高级设置' }).click()
  await expect(page.getByText('设置机器人服务', { exact: true })).toBeVisible()
  await page.getByText('设置机器人服务', { exact: true }).click()
  await expect(page.getByText('设置机器人服务', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '返回高级设置' }).click()
  await page.locator('.sec-group').filter({ hasText: '功能介绍图' }).getByText('功能介绍图', { exact: true }).last().click()
  await expect(page.getByRole('dialog', { name: '功能介绍图' })).toBeVisible()
  await page.getByRole('dialog', { name: '功能介绍图' }).getByRole('button', { name: '关闭' }).click()
  await page.getByRole('button', { name: '开发设置' }).click()
  await expect(page.getByText('AppID 接入凭证', { exact: true })).toBeVisible()
  await page.getByText('事件订阅与回调地址', { exact: true }).click()
  await expect(page.getByText('接入方式', { exact: false }).first()).toBeVisible()
  await page.getByRole('button', { name: '返回开发设置' }).click()
  await page.getByRole('button', { name: '账号信息' }).click()
  await page.getByRole('button', { name: '通知中心', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '通知中心' })).toBeVisible()
  await expect(page.getByRole('button', { name: '账号信息' })).toHaveAttribute('aria-current', 'page')
})

for (const width of [1440, 375]) {
  test(`开放平台主色实时切换并覆盖功能配置 (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await mockPanel(page)
    await page.goto('/web/openapi')
    const create = page.getByRole('button', { name: '创建机器人', exact: true })
    const platformTab = page.getByRole('navigation', { name: '开放平台页面切换' }).getByRole('button', { name: '开放平台' })
    for (const [name, color, hover] of [
      ['梦幻紫', 'rgb(124, 92, 246)', 'rgb(106, 73, 238)'],
      ['森林绿', 'rgb(22, 163, 74)', 'rgb(19, 139, 63)'],
    ]) {
      await page.getByTitle('主题', { exact: true }).click()
      await page.locator('.theme-opt').filter({ hasText: name }).click()
      await page.getByTitle('主题', { exact: true }).click()
      await expect(create).toHaveCSS('background-color', color)
      await expect(platformTab).toHaveCSS('background-color', color)
      await create.hover()
      await expect(create).toHaveCSS('background-color', hover)
      await page.mouse.move(0, 0)
    }
    await page.getByTitle('切换夜间模式').click()
    await expect(create).toHaveCSS('background-color', 'rgb(22, 163, 74)')
    await page.reload()
    await expect(create).toHaveCSS('background-color', 'rgb(22, 163, 74)')
    await page.getByRole('button', { name: '功能配置', exact: true }).click()
    await expect(page.locator('.feature-tab.active')).toHaveCSS('color', 'rgb(22, 163, 74)')
    await page.locator('.phone-menu-strip button').first().press('Enter')
    await expect(page.locator('.phone-menu-strip button.active')).toHaveCSS('color', 'rgb(22, 163, 74)')
    await page.getByTitle('切换日间模式').click()
    await platformTab.click()
    await expect(create).toHaveCSS('background-color', 'rgb(22, 163, 74)')
  })
}
