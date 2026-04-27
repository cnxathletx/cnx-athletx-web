import { describe, it, expect } from 'vitest'
import { promptpayProvider } from './promptpay'
import type { Env } from '../../lib/types'

const fakeEnv = {} as Env

describe('promptpayProvider', () => {
  it('id is "promptpay"', () => {
    expect(promptpayProvider.id).toBe('promptpay')
  })

  it('displayName has en and th', () => {
    expect(promptpayProvider.displayName.en).toBe('PromptPay')
    expect(promptpayProvider.displayName.th).toBeTruthy()
  })

  it('isEnabled false when promptpay_number missing', () => {
    expect(promptpayProvider.isEnabled({})).toBe(false)
    expect(promptpayProvider.isEnabled({ promptpay_number: '' })).toBe(false)
  })

  it('isEnabled true when promptpay_number set', () => {
    expect(promptpayProvider.isEnabled({ promptpay_number: '0812345678' })).toBe(true)
  })

  it('createIntent returns instructions intent with QR url and amount', async () => {
    const intent = await promptpayProvider.createIntent({
      order: { id: 'O1', total_thb: 169900, customer_email: 'a@b.co' },
      settings: { promptpay_number: '0812345678' },
      env: fakeEnv,
    })
    expect(intent.kind).toBe('instructions')
    expect(intent.provider).toBe('promptpay')
    if (intent.kind !== 'instructions') throw new Error('expected instructions')
    expect(intent.instructions.promptpay_number).toBe('0812345678')
    expect(intent.instructions.amount_thb).toBe('1699.00')
    expect(intent.instructions.qr_url).toBe('https://promptpay.io/0812345678/1699.00.png')
  })

  it('createIntent throws when promptpay_number absent', async () => {
    await expect(
      promptpayProvider.createIntent({
        order: { id: 'O1', total_thb: 100, customer_email: 'a@b.co' },
        settings: {},
        env: fakeEnv,
      })
    ).rejects.toThrow(/promptpay_number/)
  })

  it('requiredSettingKeys lists promptpay_number', () => {
    expect(promptpayProvider.requiredSettingKeys).toEqual(['promptpay_number'])
  })

  it('renderInstructions returns null when promptpay_number missing', () => {
    expect(
      promptpayProvider.renderInstructions({
        order: { id: 'O1', total_thb: 100, customer_email: 'a@b.co' },
        settings: {},
      })
    ).toBeNull()
    expect(
      promptpayProvider.renderInstructions({
        order: { id: 'O1', total_thb: 100, customer_email: 'a@b.co' },
        settings: { promptpay_number: '   ' },
      })
    ).toBeNull()
  })

  it('renderInstructions returns block with rows, qrImageUrl, footnote', () => {
    const block = promptpayProvider.renderInstructions({
      order: { id: 'O1', total_thb: 169900, customer_email: 'a@b.co' },
      settings: { promptpay_number: '0812345678' },
    })
    expect(block).not.toBeNull()
    expect(block!.title).toBe('Payment Details')
    expect(block!.rows).toEqual([
      { label: 'Amount', value: '฿1,699.00' },
      { label: 'PromptPay', value: '0812345678' },
    ])
    expect(block!.qrImageUrl).toBe('https://promptpay.io/0812345678/1699.00.png')
    expect(block!.footnote).toMatch(/order ID/i)
  })
})
