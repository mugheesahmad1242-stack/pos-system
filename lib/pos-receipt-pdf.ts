import { jsPDF } from 'jspdf'

export interface PosReceiptItem {
  name: string
  quantity: number
  unit_price: number
  line_total: number
}

export interface PosReceiptData {
  shopName: string
  receiptNumber: string
  dateTime: string
  customerName: string
  items: PosReceiptItem[]
  grandTotal: number
  paidAmount: number
  remainingAmount: number
  paymentStatus: string
  currency?: string
}

const money = (
  value: number,
  currency = 'PKR',
) =>
  `${currency} ${Number(value || 0).toFixed(2)}`

export function generatePosReceiptPDF(
  receipt: PosReceiptData,
): void {
  const width = 80
  const margin = 5
  const contentWidth = width - margin * 2

  const estimatedHeight = Math.max(
    125,
    76 + receipt.items.length * 9,
  )

  const doc = new jsPDF({
    unit: 'mm',
    format: [width, estimatedHeight],
  })

  let y = 8

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)

  doc.text(
    receipt.shopName || 'Perfect Traders',
    width / 2,
    y,
    { align: 'center' },
  )

  y += 6

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')

  doc.text(
    'SALE RECEIPT',
    width / 2,
    y,
    { align: 'center' },
  )

  y += 5

  doc.setFontSize(8)

  doc.text(
    `Bill: ${receipt.receiptNumber}`,
    margin,
    y,
  )

  y += 4

  doc.text(
    `Date: ${receipt.dateTime}`,
    margin,
    y,
  )

  y += 4

  doc.text(
    `Customer: ${
      receipt.customerName ||
      'Walk-in Customer'
    }`,
    margin,
    y,
  )

  y += 5

  doc.line(
    margin,
    y,
    width - margin,
    y,
  )

  y += 5

  doc.setFont('helvetica', 'bold')

  doc.text(
    'ITEM',
    margin,
    y,
  )

  doc.text(
    'QTY',
    width - 36,
    y,
    { align: 'center' },
  )

  doc.text(
    'TOTAL',
    width - margin,
    y,
    { align: 'right' },
  )

  y += 4

  doc.setFont('helvetica', 'normal')

  for (const item of receipt.items) {
    const nameLines =
      doc.splitTextToSize(
        item.name,
        contentWidth - 27,
      )

    doc.text(
      nameLines,
      margin,
      y,
    )

    doc.text(
      String(item.quantity),
      width - 36,
      y,
      { align: 'center' },
    )

    doc.text(
      money(
        item.line_total,
        receipt.currency,
      ),
      width - margin,
      y,
      { align: 'right' },
    )

    y += Math.max(
      5,
      nameLines.length * 4,
    )

    doc.setFontSize(7)

    doc.text(
      `@ ${money(
        item.unit_price,
        receipt.currency,
      )}`,
      margin,
      y,
    )

    doc.setFontSize(8)

    y += 4
  }

  doc.line(
    margin,
    y,
    width - margin,
    y,
  )

  y += 5

  const rows = [
    [
      'Grand Total',
      money(
        receipt.grandTotal,
        receipt.currency,
      ),
    ],
    [
      'Paid',
      money(
        receipt.paidAmount,
        receipt.currency,
      ),
    ],
    [
      'Remaining',
      money(
        receipt.remainingAmount,
        receipt.currency,
      ),
    ],
    [
      'Status',
      receipt.paymentStatus.toUpperCase(),
    ],
  ]

  for (const [label, value] of rows) {
    doc.setFont(
      'helvetica',
      label === 'Grand Total'
        ? 'bold'
        : 'normal',
    )

    doc.text(
      label,
      margin,
      y,
    )

    doc.text(
      value,
      width - margin,
      y,
      { align: 'right' },
    )

    y += 5
  }

  y += 4

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)

  doc.text(
    'Thank you!',
    width / 2,
    y,
    { align: 'center' },
  )

  doc.save(
    `${receipt.receiptNumber || 'receipt'}.pdf`,
  )
}