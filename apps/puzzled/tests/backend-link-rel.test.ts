import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'

function literalAttribute(node: ts.JsxOpeningLikeElement, name: string): string | undefined {
	for (const attr of node.attributes.properties) {
		if (!ts.isJsxAttribute(attr) || !ts.isIdentifier(attr.name) || attr.name.text !== name) continue
		const value = attr.initializer
		if (value && ts.isJsxExpression(value)) {
			let expression = value.expression
			while (expression && ts.isParenthesizedExpression(expression))
				expression = expression.expression
			if (
				expression &&
				(ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression))
			) {
				return expression.text
			}
		} else if (value && ts.isStringLiteral(value)) {
			return value.text
		}
		return undefined
	}
}

function violationsIn(path: string, source: string): string[] {
	const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest)
	const violations: string[] = []

	function visit(node: ts.Node) {
		if (
			(ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
			ts.isIdentifier(node.tagName) &&
			(node.tagName.text === 'a' || node.tagName.text === 'A')
		) {
			const href = literalAttribute(node, 'href')
			const rel = literalAttribute(node, 'rel')
			if (href && /^\/(api|auth|oauth)\//.test(href) && !rel?.split(/\s+/).includes('external')) {
				const { line, character } = file.getLineAndCharacterOfPosition(node.getStart(file))
				violations.push(
					`${path}:${line + 1}:${character + 1} <${node.tagName.text} href=${JSON.stringify(href)}> needs rel="external"`,
				)
			}
		}
		ts.forEachChild(node, visit)
	}

	visit(file)
	return violations
}

test('literal backend links opt out of Solid router navigation', () => {
	const controls = [
		'<>',
		'<a href="/api/download" />',
		'<A href={"/auth/sign-in?next=/"} rel="noopener">Sign in</A>',
		'<a href={(`/oauth/start`)} rel="not-external" />',
		'<A href="/oauth/dynamic-rel" rel={rel} />',
		'<a href="/api/download" rel="external" />',
		"<A href={'/auth/sign-in'} rel={'noopener external noreferrer'} />",
		'<a href={`/oauth/start`} rel={`external`} />',
		'<a href="/apiary/help" />',
		'<a href="//example.com/api/download" />',
		'<a href="https://example.com/api/download" />',
		'<a href={path} />',
		'<Link href="/api/download" />',
		'</>',
	].join('\n')
	expect(violationsIn('controls.tsx', controls)).toEqual([
		'controls.tsx:2:1 <a href="/api/download"> needs rel="external"',
		'controls.tsx:3:1 <A href="/auth/sign-in?next=/"> needs rel="external"',
		'controls.tsx:4:1 <a href="/oauth/start"> needs rel="external"',
		'controls.tsx:5:1 <A href="/oauth/dynamic-rel"> needs rel="external"',
	])

	// Only explicit literals are checked; no prop, spread, or URL expression resolution.
	const src = join(import.meta.dir, '..', 'src')
	const paths = [...new Bun.Glob('**/*.{tsx,jsx}').scanSync({ cwd: src })].sort()
	expect(paths.length).toBeGreaterThan(0)
	expect(
		paths.flatMap((path) => violationsIn(path, readFileSync(join(src, path), 'utf8'))),
	).toEqual([])
})
