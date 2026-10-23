import { test, expect } from '@playwright/test'

async function mockPanel(page, { ready = true } = {}) {
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
      if (target === '/bopen/v2/get_audit_developer_info') data.audit_developer_info = { developer_info: { subject_name: '测试主体', subject_type: 2 } }
      if (target === '/cgi-bin/v2/info/list_bots') Object.assign(data, {
        create_remain: 2,
        bots: [{ bot_appid: 10001, bot_name: '主题测试机器人', bot_status: 1, online_state: { online_state: 1 } }],
      })
      if (target === '/cgi-bin/v2/info/query') Object.assign(data, {
        base_info: { bot_name: '主题测试机器人', bot_desc: '测试简介', bot_status: 1, online_state: { online_state: 1 } },
        developer_info: { subject_type: 2 },
      })
      if (target === '/cgi-bin/v2/datareport/query') Object.assign(data, {
        msg_data: [{ report_date: '20261020', up_msg_cnt: 100, up_msg_uv: 12, down_msg_cnt: 90, bot_msg_cnt: 190 }],
        group_data: [{ report_date: '20261020', existing_groups: 5, used_groups: 3 }],
        friend_data: [{ report_date: '20261020', stock_added_friends: 8, used_friends: 4 }],
        guild_data: [{ report_date: '20261020', in_guild_cnt: 2, used_guild_cnt: 1 }],
      })
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
    await expect(page.locator('.create-modal')).toHaveCSS('background-color', 'rgb(28, 31, 38)')
    await expect(page.locator('.create-modal input')).toHaveCSS('color', 'rgb(230, 233, 239)')
    await page.locator('.create-modal').getByRole('button', { name: '取消' }).click()
    await page.locator('.bot-card').click()
    await expect(page.locator('.sec-group').first()).toHaveCSS('background-color', 'rgb(28, 31, 38)')
    await page.locator('.row').filter({ has: page.locator('.row-label', { hasText: '昵称' }) }).click()
    await expect(page.getByRole('dialog', { name: '设置机器人昵称' })).toHaveCSS('background-color', 'rgb(28, 31, 38)')
    await expect(page.locator('.editor-input')).toHaveCSS('color', 'rgb(230, 233, 239)')
    await page.getByRole('dialog').getByRole('button', { name: '取消' }).click()
    await page.getByRole('button', { name: '运营数据', exact: true }).click()
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
    await expect(page.locator('.phone-menu-strip button.active')).toHaveCSS('color', 'rgb(0, 153, 255)')
    await expect(page.locator('.phone-menu-strip button span').first()).toHaveCSS('color', 'rgb(230, 233, 239)')
    await page.getByTitle('切换日间模式').click()
    await expect(page.locator('.function-config')).toHaveAttribute('data-theme', 'light')
    await page.getByRole('button', { name: '开放平台', exact: true }).click()
    await expect(dashboard).toHaveAttribute('data-theme', 'light')
    await expect(dashboard).toHaveCSS('background-color', 'rgb(245, 245, 247)')
    await expect(page.locator('.report-chart-grid text').first()).toHaveCSS('fill', 'rgb(142, 142, 147)')
  })
}

test('已有夜间偏好下的授权页面和扫码弹窗', async ({ page }) => {
  await mockPanel(page, { ready: false })
  await page.addInitScript(() => localStorage.setItem('elaina_dark', '1'))
  await page.goto('/web/openapi')
  await expect(page.locator('.v2-gate')).toHaveCSS('background-color', 'rgb(28, 31, 38)')
  await page.getByRole('button', { name: '使用 QQ 扫码登录' }).click()
  await expect(page.locator('.login-dialog')).toHaveCSS('background-color', 'rgb(28, 31, 38)')
  await expect(page.locator('.login-dialog-qr-image')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await page.screenshot({ path: '.cache/openapi-dark-login.png', fullPage: true })
})
