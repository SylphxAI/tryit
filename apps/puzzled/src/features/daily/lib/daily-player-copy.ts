import type { Locale } from '@/lib/i18n/config'
import { DAILY_FREE_PICKS } from './daily-picks'

const english = {
	picks: '{used, number} of {total, number} free picks used today',
	reset: 'Resets in {hours, number}h {minutes, number}m',
	install: 'Add Tryit to your Home Screen',
	ios: 'Tap Share → Add to Home Screen.',
	reminders:
		'Once installed, sign in and turn on daily streak reminders in Settings → Notifications.',
}

// Shared across Home, Play and Results, including locales with a frozen game catalogue.
export const DAILY_PLAYER_COPY: Record<
	Locale,
	{ picks: string; reset: string; install: string; ios: string; reminders: string }
> = {
	'en-US': english,
	'en-GB': english,
	es: {
		picks: 'Hoy has usado {used, number} de tus {total, number} jugadas gratis',
		reset: 'Se renuevan en {hours, number} h y {minutes, number} min',
		install: 'Añade Tryit a tu pantalla de inicio',
		ios: 'Toca Compartir → Añadir a pantalla de inicio.',
		reminders:
			'Una vez instalado, inicia sesión y activa los recordatorios diarios de racha en Ajustes → Notificaciones.',
	},
	'pt-BR': {
		picks: '{used, number} de {total, number} escolhas grátis usadas hoje',
		reset: 'Renova em {hours, number} h e {minutes, number} min',
		install: 'Adicione o Tryit à tela de início',
		ios: 'Toque em Compartilhar → Adicionar à Tela de Início.',
		reminders:
			'Depois de instalar, entre na sua conta e ative os lembretes diários da sequência em Configurações → Notificações.',
	},
	ja: {
		picks: '今日の無料枠：{total, number}つ中{used, number}つ使用済み',
		reset: 'リセットまで{hours, number}時間{minutes, number}分',
		install: 'Tryitをホーム画面に追加',
		ios: '「共有」→「ホーム画面に追加」をタップ。',
		reminders:
			'追加したらログインし、「設定」→「通知」で毎日の連続記録リマインダーをオンにできます。',
	},
	'zh-HK': {
		picks: '今日 {total, number} 個免費名額已用 {used, number} 個',
		reset: '仲有 {hours, number} 小時 {minutes, number} 分鐘重設',
		install: '將 Tryit 加到主畫面',
		ios: '撳「分享」→「加入主畫面」。',
		reminders: '加到主畫面後，登入並到「設定」→「通知」開啟每日連續遊玩提醒。',
	},
	'zh-TW': {
		picks: '今天 {total, number} 個免費名額已用 {used, number} 個',
		reset: '再過 {hours, number} 小時 {minutes, number} 分鐘重設',
		install: '將 Tryit 加入主畫面',
		ios: '點一下「分享」→「加入主畫面」。',
		reminders: '加入後登入，前往「設定」→「通知」開啟每日連續遊玩提醒。',
	},
	'zh-CN': {
		picks: '今天 {total, number} 个免费名额已用 {used, number} 个',
		reset: '还有 {hours, number} 小时 {minutes, number} 分钟重置',
		install: '将 Tryit 添加到主屏幕',
		ios: '轻点“分享”→“添加到主屏幕”。',
		reminders: '添加后登录，在“设置”→“通知”中开启每日连玩提醒。',
	},
}

/**
 * The copy only uses `{name, number}` arguments, so Intl.NumberFormat formats them
 * exactly as IntlMessageFormat would without putting its parser on Home.
 */
function numberTemplate(template: string, locale: Locale) {
	const number = new Intl.NumberFormat(locale)
	return (values: Record<string, number>) =>
		template.replace(/\{(\w+), number\}/g, (_, name: string) => number.format(values[name] ?? 0))
}

export function dailyPlayerCopy(locale: Locale) {
	const messages = DAILY_PLAYER_COPY[locale]
	const picks = numberTemplate(messages.picks, locale)
	const reset = numberTemplate(messages.reset, locale)
	return {
		install: messages.install,
		ios: messages.ios,
		reminders: messages.reminders,
		picks: (used: number) => picks({ used, total: DAILY_FREE_PICKS }),
		reset: (remainingMs: number) => {
			const minutes = Math.max(0, Math.ceil(remainingMs / 60_000))
			return reset({ hours: Math.floor(minutes / 60), minutes: minutes % 60 })
		},
	}
}
