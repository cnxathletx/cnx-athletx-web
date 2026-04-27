import { describe, it, expect } from 'vitest'
import { bankTransferProvider } from './bank-transfer'
import type { Env } from '../../lib/types'

const fakeEnv = {} as Env

describe('bankTransferProvider', () => {
  it('id is "bank_transfer"', () => {
    expect(bankTransferProvider.id).toBe('bank_transfer')
  })

  it('isEnabled false when any bank field missing', () => {
    expect(bankTransferProvider.isEnabled({})).toBe(false)
    expect(bankTransferProvider.isEnabled({ bank_name: 'X' })).toBe(false)
    expect(bankTransferProvider.isEnabled({ bank_name: 'X', bank_account_name: 'Y' })).toBe(false)
  })

  it('isEnabled true when all 3 bank fields set', () => {
    expect(
      bankTransferProvider.isEnabled({
        bank_name: 'Kasikorn',
        bank_account_name: 'CNX',
        bank_account_number: '123-4',
      })
    ).toBe(true)
  })

  it('createIntent returns instructions intent with bank fields', async () => {
    const intent = await bankTransferProvider.createIntent({
      order: { id: 'O1', total_thb: 169900, customer_email: 'a@b.co' },
      settings: {
        bank_name: 'Kasikorn',
        bank_account_name: 'CNX AthletX Co., Ltd.',
        bank_account_number: '123-4-56789-0',
      },
      env: fakeEnv,
    })
    expect(intent.kind).toBe('instructions')
    if (intent.kind !== 'instructions') throw new Error('expected instructions')
    expect(intent.instructions.bank_name).toBe('Kasikorn')
    expect(intent.instructions.account_name).toBe('CNX AthletX Co., Ltd.')
    expect(intent.instructions.account_number).toBe('123-4-56789-0')
    expect(intent.instructions.amount_thb).toBe('1699.00')
  })

  it('createIntent throws when bank fields missing', async () => {
    await expect(
      bankTransferProvider.createIntent({
        order: { id: 'O1', total_thb: 100, customer_email: 'a@b.co' },
        settings: {},
        env: fakeEnv,
      })
    ).rejects.toThrow(/bank/i)
  })

  it('requiredSettingKeys lists the three bank fields', () => {
    expect(bankTransferProvider.requiredSettingKeys).toEqual([
      'bank_name', 'bank_account_name', 'bank_account_number',
    ])
  })

  it('renderInstructions returns null when any field missing', () => {
    expect(
      bankTransferProvider.renderInstructions({
        order: { id: 'O1', total_thb: 100, customer_email: 'a@b.co' },
        settings: { bank_name: 'Kasikorn', bank_account_name: 'CNX' },
      })
    ).toBeNull()
  })

  it('renderInstructions returns block with all bank rows and footnote', () => {
    const block = bankTransferProvider.renderInstructions({
      order: { id: 'O1', total_thb: 169900, customer_email: 'a@b.co' },
      settings: {
        bank_name: 'Kasikorn',
        bank_account_name: 'CNX AthletX Co., Ltd.',
        bank_account_number: '123-4-56789-0',
      },
    })
    expect(block).not.toBeNull()
    expect(block!.title).toBe('Payment Details')
    expect(block!.rows).toEqual([
      { label: 'Amount', value: '฿1,699.00' },
      { label: 'Bank', value: 'Kasikorn' },
      { label: 'Account Name', value: 'CNX AthletX Co., Ltd.' },
      { label: 'Account Number', value: '123-4-56789-0' },
    ])
    expect(block!.qrImageUrl).toBeUndefined()
    expect(block!.footnote).toMatch(/order ID/i)
  })
})
