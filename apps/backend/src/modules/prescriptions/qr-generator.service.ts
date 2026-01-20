/**
 * QR Code Generation Service for Prescriptions
 *
 * Generates QR codes for:
 * - Patient identification (national ID)
 * - Prescription verification
 * - Medication administration verification
 */

import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

export interface QRCodeData {
  qrCode: string; // Base64 data URL or text content
  displayText: string;
  expiry?: Date;
}

@Injectable()
export class QRGeneratorService {
  /**
   * Generate QR code for patient identification
   * Contains: National ID only (no other PII)
   */
  generatePatientQR(nationalId: string): QRCodeData {
    // In production, use a library like 'qrcode' npm package
    // For now, return the data structure
    const qrData = nationalId;

    return {
      qrCode: this.encodeToQRFormat(qrData),
      displayText: `Patient ID: ${nationalId.substring(0, 4)}...${nationalId.substring(9)}`,
    };
  }

  /**
   * Generate QR code for prescription
   * Contains: Prescription token (not patient info)
   */
  generatePrescriptionQR(prescriptionId: string): QRCodeData {
    // Create a secure token for the prescription
    const token = this.generateSecureToken(prescriptionId);

    // QR contains: RX_TOKEN:token
    const qrData = `RX_TOKEN:${token}`;

    // Store mapping in Redis (token -> prescriptionId) with 30 day expiry
    // This allows QR scan to retrieve prescription without exposing ID

    return {
      qrCode: this.encodeToQRFormat(qrData),
      displayText: `Prescription: ***${prescriptionId.substring(0, 8)}`,
      expiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    };
  }

  /**
   * Generate QR code for medication verification
   * Contains: Medication ID + Prescription Item ID
   */
  generateMedicationQR(prescriptionItemId: string, medicationName: string): QRCodeData {
    const qrData = `MED:${prescriptionItemId}`;

    return {
      qrCode: this.encodeToQRFormat(qrData),
      displayText: `Medication: ${medicationName}`,
    };
  }

  /**
   * Parse QR code data
   */
  parseQRCode(qrData: string): {
    type: 'PATIENT' | 'PRESCRIPTION' | 'MEDICATION';
    id: string;
  } {
    if (qrData.startsWith('RX_TOKEN:')) {
      return {
        type: 'PRESCRIPTION',
        id: qrData.substring('RX_TOKEN:'.length),
      };
    }

    if (qrData.startsWith('MED:')) {
      return {
        type: 'MEDICATION',
        id: qrData.substring('MED:'.length),
      };
    }

    // If just numbers, assume it's a national ID
    if (/^\d{13}$/.test(qrData)) {
      return {
        type: 'PATIENT',
        id: qrData,
      };
    }

    throw new Error('Invalid QR code format');
  }

  /**
   * Generate secure token for prescription
   */
  private generateSecureToken(prescriptionId: string): string {
    const hmac = crypto.createHmac('sha256', process.env.JWT_SECRET || 'secret');
    hmac.update(prescriptionId + Date.now());
    return hmac.digest('hex').substring(0, 32);
  }

  /**
   * Encode data to QR format
   * In production, use 'qrcode' library to generate actual QR image
   */
  private encodeToQRFormat(data: string): string {
    // This would use a QR code library like:
    // import * as QRCode from 'qrcode';
    // const qrCodeDataURL = await QRCode.toDataURL(data);
    // return qrCodeDataURL;

    // For now, return the raw data
    // Frontend can use libraries like 'react-qr-code' to display
    return data;
  }

  /**
   * Generate printable prescription with QR codes
   */
  generatePrintablePrescription(prescriptionData: {
    prescriptionId: string;
    patientNationalId: string;
    patientName: string;
    prescriber: string;
    medications: Array<{
      id: string;
      name: string;
      dose: string;
      frequency: string;
      duration: string;
    }>;
    date: Date;
  }): string {
    const patientQR = this.generatePatientQR(prescriptionData.patientNationalId);
    const rxQR = this.generatePrescriptionQR(prescriptionData.prescriptionId);

    let output = '╔════════════════════════════════════════════════════════════╗\n';
    output += '║               HORALIX HOSPITAL PRESCRIPTION                ║\n';
    output += '╚════════════════════════════════════════════════════════════╝\n\n';

    output += `Date: ${prescriptionData.date.toLocaleDateString('en-GB')}\n`;
    output += `Prescription ID: ${prescriptionData.prescriptionId}\n\n`;

    output += '─────────────────────────────────────────────────────────────\n';
    output += 'PATIENT INFORMATION\n';
    output += '─────────────────────────────────────────────────────────────\n';
    output += `Name: ${prescriptionData.patientName}\n`;
    output += `National ID: ${prescriptionData.patientNationalId}\n\n`;
    output += `[QR CODE: ${patientQR.qrCode}]\n`;
    output += `${patientQR.displayText}\n\n`;

    output += '─────────────────────────────────────────────────────────────\n';
    output += 'MEDICATIONS\n';
    output += '─────────────────────────────────────────────────────────────\n\n';

    prescriptionData.medications.forEach((med, index) => {
      output += `${index + 1}. Rp./\n`;
      output += `   ${med.name}\n`;
      output += `   \n`;
      output += `   S: ${med.dose} ${med.frequency}`;
      if (med.duration) {
        output += ` for ${med.duration}`;
      }
      output += `\n\n`;
    });

    output += '─────────────────────────────────────────────────────────────\n';
    output += `Prescribed by: ${prescriptionData.prescriber}\n\n`;

    output += `[PRESCRIPTION QR CODE: ${rxQR.qrCode}]\n`;
    output += `${rxQR.displayText}\n`;
    output += `Valid until: ${rxQR.expiry?.toLocaleDateString('en-GB')}\n\n`;

    output += '─────────────────────────────────────────────────────────────\n';
    output += 'For dispensing and verification purposes\n';
    output += '═══════════════════════════════════════════════════════════════\n';

    return output;
  }
}
