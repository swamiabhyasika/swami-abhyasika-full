// Copies of the four message builders from the ORIGINAL app (public/app.js before the templates feature).
// Used only by tests, to prove the editable default templates produce exactly the same text.
module.exports = {
  seat_confirmed(s, newFromDate, newDueDate, _paySeat, slotStr) {
    return '\uD83D\uDE4F Namaste *'+s.name+'*!\n\nYour Basement Library seat is confirmed:\n\n\uD83D\uDDD3 Period: *'+newFromDate+'* \u2192 *'+newDueDate+'*\n\uD83E\uDE91 Seat: #'+_paySeat+'\n\u23F0 Daily Slots:\n'+slotStr+'\n\n*Swami Abhyasika \u2014 Basement Library*';
  },
  fee_receipt(name, receiptNo, date, fromDate, dueDate, course, method, amount) {
    return (
        '🙏 Namaste *' + name + '*!\n\n' +
        '🧾 *Fee Receipt — Swami Abhyasika*\n' +
        '━━━━━━━━━━━━━━━━━━\n' +
        '🧾 Receipt No: *' + receiptNo + '*\n' +
        '📅 Payment Date: *' + date + '*\n' +
        '📆 From Date: *' + fromDate + '*\n' +
        '📆 Valid Until: *' + dueDate + '*\n' +
        '📚 Course: *' + course + '*\n' +
        '💳 Payment Method: *' + method + '*\n' +
        '💰 Amount Paid: *₹' + Number(amount).toLocaleString() + '*\n \n' +
        '━━━━━━━━━━━━━━━━━━\n' +
        'Thank you for your payment! 🙏\n' +
        '*Swami Abhyasika — Center For Learning*'
    );
  },
  admission_confirmed(name, receiptNo, opts, fmt, fromDate, dueDate, seat, slotStr, fee) {
    return (
        '🙏 Namaste, *' + name + '*!\n\n' +
        'Your Admission to *Swami Abhyasika* is Confirmed.\n\n' +
        '✅ Your Library Seat has been Successfully Reserved.\n' +
        '━━━━━━━━━━━━━━━━━━\n' +
        '📄 *FEE RECEIPT — SWAMI ABHYASIKA*\n' +
        '━━━━━━━━━━━━━━━━━━\n' +
        '🧾 Receipt No: *' + receiptNo + '*\n' +
        (opts.studentId   ? '🆔 Student ID: *'       + opts.studentId    + '*\n' : '') +
        '👤 Student Name: *' + name + '*\n' +
        (opts.admissionDate ? '📅 Admission Date: *'  + fmt(opts.admissionDate) + '*\n' : '') +
        '📅 Payment Date: *'  + fmt(opts.paymentDate || fromDate) + '*\n' +
        '📅 Membership Start: *' + fmt(fromDate)  + '*\n' +
        '📅 Valid Until: *'      + fmt(dueDate)   + '*\n' +
        (opts.course      ? '🎯 Course: *'           + opts.course       + '*\n' : '') +
        '💺 Seat No: *' + seat + '*\n' +
        '🕒 Slot: *' + slotStr + '*\n' +
        (opts.paymentMethod ? '💳 Payment Method: *'  + opts.paymentMethod + '*\n' : '') +
        (fee > 0 ? '💰 Amount Paid: *₹' + Number(fee).toLocaleString() + '*\n' : '') +
        '🔖 Payment Status: *PAID ✅*\n' +
        '━━━━━━━━━━━━━━━━━━\n' +
        '🎓 Admission Status: *CONFIRMED ✅*\n' +
        '━━━━━━━━━━━━━━━━━━\n' +
        '📚 *Swami Abhyasika — Basement Library*\n' +
        'Thank you for choosing us. We wish you great success in your studies. 🌟\n' +
        '━━━━━━━━━━━━━━━━━━'
    );
  },
  fee_reminder(name, fromDate, dueDate, remaining, diffDays) {
    const periodLine = fromDate
        ? '\uD83D\uDDD3 Subscription Period: *' + fromDate + '* \u2192 *' + (dueDate || '—') + '*'
        : '\uD83D\uDDD3 Due Date: *' + (dueDate || '—') + '*';
    let statusLine = '';
      if (diffDays === null) {
        statusLine = 'Your membership due date is not set. Please visit us to update your records.';
      } else if (diffDays < 0) {
        const n = Math.abs(diffDays);
        statusLine = '\u26A0\uFE0F Your membership has *expired ' + n + ' day' + (n !== 1 ? 's' : '') + ' ago*.';
      } else if (diffDays === 0) {
        statusLine = '\u26A0\uFE0F Your membership *expires TODAY*. Please renew immediately.';
      } else {
        statusLine = '\u23F3 Your membership is expiring in *' + diffDays + ' day' + (diffDays !== 1 ? 's' : '') + '*.';
      }
    const feeNote = remaining > 0
        ? '\n\n\uD83D\uDCB0 *Pending Fees: \u20B9' + remaining.toLocaleString() + '*\nKindly clear your dues at the earliest to continue enjoying our facilities.'
        : '\n\u2705 Your fees are up to date.';
    return (
        '\uD83D\uDE4F Namaste *' + name + '*!\n\n' +
        'This is a gentle reminder from *Swami Abhyasika*.\n\n' +
        periodLine + '\n' +
        statusLine +
        feeNote + '\n\n' +
        'Please renew your membership or visit us to avoid any interruption in services.\n\n' +
        'Thank you \uD83D\uDE4F\n*Swami Abhyasika — Center for Spiritual Practice & Learning*'
    );
  },
};
