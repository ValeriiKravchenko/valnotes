import { describe, expect, it } from 'vitest'
import { parseBookLinks } from './bookLinks'

const diskUrl = 'https://disk.yandex.ru/client/disk/Books?idApp=client&dialog=slider&idDialog=%2Fdisk%2FBooks%2Fa.pdf'

describe('bookLinks.ts — разбор файла ссылок', () => {
  it('принимает объект title -> ссылка на Яндекс.Диск', () => {
    expect(parseBookLinks(JSON.stringify({ 'Чистый код': diskUrl }))).toEqual({
      ok: true,
      links: { 'Чистый код': diskUrl },
    })
  })

  it('пустой объект — корректный файл без ссылок', () => {
    expect(parseBookLinks('{}')).toEqual({ ok: true, links: {} })
  })

  it('отклоняет не-JSON, массив и не-объект', () => {
    expect(parseBookLinks('<!doctype html>')).toEqual({ ok: false })
    expect(parseBookLinks('[]')).toEqual({ ok: false })
    expect(parseBookLinks('"строка"')).toEqual({ ok: false })
    expect(parseBookLinks('null')).toEqual({ ok: false })
  })

  it('отклоняет файл целиком, если хоть одна ссылка ведёт не на Яндекс.Диск', () => {
    expect(parseBookLinks(JSON.stringify({ a: diskUrl, b: 'javascript:alert(1)' }))).toEqual({ ok: false })
    expect(parseBookLinks(JSON.stringify({ a: 'http://disk.yandex.ru/x' }))).toEqual({ ok: false })
    expect(parseBookLinks(JSON.stringify({ a: 42 }))).toEqual({ ok: false })
  })
})
