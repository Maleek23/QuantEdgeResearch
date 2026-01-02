import jsPDF from 'jspdf';
import 'jspdf-autotable';

// Extend jsPDF with autoTable type
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

export async function generateDailyTradeAnalysisPDF(ideas: any[]) {
  const doc = new jsPDF();
  const date = new Date().toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  // Header
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, 210, 40, 'F');
  
  doc.setTextColor(34, 211, 238); // cyan-400
  doc.setFontSize(24);
  doc.text('QuantEdge Research', 14, 20);
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.text('Daily Trade Analysis & Risk Documentation', 14, 30);
  doc.text(date, 140, 30);

  let yPos = 50;

  ideas.forEach((idea, index) => {
    if (yPos > 250) {
      doc.addPage();
      yPos = 20;
    }

    // Idea Header
    doc.setFillColor(241, 245, 249);
    doc.rect(14, yPos, 182, 10, 'F');
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`${idea.symbol} - ${idea.assetType.toUpperCase()} ${idea.optionType ? idea.optionType.toUpperCase() : ''}`, 18, yPos + 7);
    
    yPos += 15;

    // Details Table
    const details = [
      ['Entry Price', `$${idea.entryPrice}`, 'Target Price', `$${idea.targetPrice}`],
      ['Stop Loss', `$${idea.stopLoss}`, 'R:R Ratio', idea.riskRewardRatio?.toFixed(2) || 'N/A'],
      ['Confidence', `${idea.confidenceScore}%`, 'Source', idea.source?.toUpperCase() || 'QUANT'],
    ];

    doc.autoTable({
      startY: yPos,
      head: [],
      body: details,
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 2 },
      columnStyles: {
        0: { fontStyle: 'bold', width: 30 },
        1: { width: 40 },
        2: { fontStyle: 'bold', width: 30 },
        3: { width: 40 },
      },
    });

    yPos = (doc as any).lastAutoTable.finalY + 10;

    // Catalyst & Analysis
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Trade Catalyst:', 14, yPos);
    yPos += 5;
    doc.setFont('helvetica', 'normal');
    const catalystLines = doc.splitTextToSize(idea.catalyst || 'No catalyst documented.', 180);
    doc.text(catalystLines, 14, yPos);
    yPos += (catalystLines.length * 5) + 5;

    doc.setFont('helvetica', 'bold');
    doc.text('Risk Analysis & Documentation:', 14, yPos);
    yPos += 5;
    doc.setFont('helvetica', 'normal');
    const analysisLines = doc.splitTextToSize(idea.analysis || 'No detailed analysis available.', 180);
    doc.text(analysisLines, 14, yPos);
    yPos += (analysisLines.length * 5) + 15;
  });

  // Footer on all pages
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text('Confidential - For Educational & Research Purposes Only. Not Financial Advice.', 105, 290, { align: 'center' });
  }

  doc.save(`QuantEdge_Analysis_${new Date().toISOString().split('T')[0]}.pdf`);
}
