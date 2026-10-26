/*
 * Fills a WhatsApp message template with real values.
 * ONE file used by both the server (preview, tests) and the browser (the screens that send messages),
 * so what you preview in Settings is exactly what gets sent.
 *
 *   {name}  → replaced by the value called "name".
 *   A line whose "optional" value is empty disappears completely (for example the Student ID line
 *   when a student has no ID). Unknown {words} are left as typed so a typing mistake is easy to spot.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WA = api;
})(typeof self !== 'undefined' ? self : this, function () {
  var OPTIONAL = {
    seat_confirmed: [],
    fee_receipt: [],
    admission_confirmed: ['studentId', 'admissionDate', 'course', 'paymentMethod', 'amount'],
    fee_reminder: [],
  };

  function render(key, template, vars) {
    var optional = OPTIONAL[key] || [];
    var out = [];
    String(template).replace(/\r\n/g, '\n').split('\n').forEach(function (line) {
      var drop = false;
      var done = line.replace(/\{(\w+)\}/g, function (whole, name) {
        if (!Object.prototype.hasOwnProperty.call(vars, name)) return whole;
        var value = vars[name] === null || vars[name] === undefined ? '' : String(vars[name]);
        if (value === '' && optional.indexOf(name) !== -1) drop = true;
        return value;
      });
      if (!drop) out.push(done);
    });
    return out.join('\n');
  }

  return { OPTIONAL: OPTIONAL, render: render };
});
