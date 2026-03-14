import ExcelJS from 'exceljs';
import { calculerDateEcheance, formaterDate, normaliserModePaiement } from '../schemas/invoiceSchema.js';

const COLUMNS = [
  { header: 'Date facture', key: 'dateFacture', width: 14 },
  { header: 'Fournisseur', key: 'fournisseur', width: 30 },
  { header: 'Total TTC', key: 'totalTTC', width: 12 },
  { header: 'Date échéance', key: 'dateEcheance', width: 14 },
  { header: 'Mode paiement', key: 'modePaiement', width: 16 },
  { header: 'État', key: 'etat', width: 12 },
  { header: 'Montant payé (acomptes)', key: 'montantPayeAcomptes', width: 22 },
  { header: 'Date paiement', key: 'datePaiement', width: 18 },
];

/**
 * Génère un buffer Excel à partir des factures validées.
 * @param {Array<import('../schemas/invoiceSchema.js').factureExtraitSchema>} factures
 * @returns {Promise<Buffer>}
 */
export async function genererExcel(factures) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Factures', {
    headerFooter: { firstHeader: 'Factures extraites' },
  });

  sheet.columns = COLUMNS;
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' },
  };

  for (const f of factures) {
    const dateEcheance = calculerDateEcheance(f.dateFacture);
    const datePaiementStr = Array.isArray(f.datesPaiementAcomptes) && f.datesPaiementAcomptes.length > 0
      ? f.datesPaiementAcomptes.map(formaterDate).join(', ')
      : '';

    sheet.addRow({
      dateFacture: formaterDate(f.dateFacture),
      fournisseur: f.fournisseur,
      totalTTC: f.totalTTC,
      dateEcheance,
      modePaiement: normaliserModePaiement(f.modePaiement),
      etat: f.etat,
      montantPayeAcomptes: f.montantPayeAcomptes ?? 0,
      datePaiement: datePaiementStr,
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
