/**
 * DOM 相关的纯函数工具。
 */

/**
 * 判断事件目标是否为可编辑区域：
 * input / textarea / select / contentEditable 元素。
 *
 * 用于全局键盘快捷键的过滤 —— 在输入框里打字时不应触发应用级快捷键。
 */
export function isEditableTarget(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null
  if (!node) return false
  const tag = node.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    node.isContentEditable
  )
}