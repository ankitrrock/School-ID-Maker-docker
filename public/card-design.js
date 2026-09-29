(function (root, factory) {
  const value = factory();
  if (typeof module === 'object' && module.exports) module.exports = value;
  else root.CardDesign = value;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const templates = [
    {
      id: 'classic',
      name: 'Classic',
      description: 'A familiar school identity, with a centered portrait.',
    },
    { id: 'modern', name: 'Modern', description: 'A bold header and crisp, contemporary details.' },
    { id: 'minimal', name: 'Minimal', description: 'Fine borders and quiet, spacious typography.' },
    {
      id: 'corporate',
      name: 'Corporate',
      description: 'A confident side stripe for staff and teams.',
    },
    { id: 'event', name: 'Event', description: 'A prominent pass title for visitors and events.' },
  ];
  const fields = {
    father_name: 'Father',
    gender: 'Gender',
    date_of_birth: 'DOB',
    blood_group: 'Blood group',
    phone: 'Phone',
    address: 'Address',
  };
  const defaults = {
    orientation: 'portrait',
    accentColor: '#1f4e79',
    fontFamily: 'sans',
    fontSize: 'normal',
    photoShape: 'rounded',
    showPhoto: true,
    showLogo: true,
    showBackground: true,
    showQr: true,
    showBarcode: true,
    visibleFields: Object.keys(fields),
    cardTitle: 'IDENTITY CARD',
    footerText: '',
  };
  const enums = {
    orientation: ['portrait', 'landscape'],
    fontFamily: ['sans', 'serif', 'mono'],
    fontSize: ['compact', 'normal', 'large'],
    photoShape: ['square', 'rounded', 'circle'],
  };
  const flags = ['showPhoto', 'showLogo', 'showBackground', 'showQr', 'showBarcode'];
  function validate(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new Error('Choose valid card customization settings.');
    if (Object.keys(input).some((key) => !Object.hasOwn(defaults, key)))
      throw new Error('Unknown card customization setting.');
    for (const [key, values] of Object.entries(enums))
      if (input[key] !== undefined && !values.includes(input[key]))
        throw new Error(`Invalid ${key}.`);
    for (const key of flags)
      if (input[key] !== undefined && typeof input[key] !== 'boolean')
        throw new Error(`Invalid ${key}.`);
    if (
      input.accentColor !== undefined &&
      (typeof input.accentColor !== 'string' || !/^#[\da-f]{6}$/i.test(input.accentColor))
    )
      throw new Error('Choose a valid accent color.');
    for (const [key, max] of [
      ['cardTitle', 24],
      ['footerText', 60],
    ])
      if (
        input[key] !== undefined &&
        (typeof input[key] !== 'string' ||
          input[key].length > max ||
          /[\x00-\x1f]/.test(input[key]))
      )
        throw new Error(`${key} must be plain text, up to ${max} characters.`);
    if (
      input.visibleFields !== undefined &&
      (!Array.isArray(input.visibleFields) ||
        input.visibleFields.length > 6 ||
        input.visibleFields.some((key) => typeof key !== 'string' || !Object.hasOwn(fields, key)) ||
        new Set(input.visibleFields).size !== input.visibleFields.length)
    )
      throw new Error('Choose valid fields to display.');
    return {
      ...defaults,
      ...input,
      visibleFields: [...(input.visibleFields || defaults.visibleFields)],
    };
  }
  function normalize(input) {
    try {
      return validate(input || {});
    } catch {
      return validate({});
    }
  }
  function color(value, fallback) {
    return /^#[\da-f]{6}$/i.test(value || '') ? value : fallback;
  }
  function fit(value, width, size, bold, font) {
    const text = String(value || '').replace(/[\r\n\t]/g, ' ');
    // Use generous glyph widths so long names remain inside their region in either renderer.
    const glyphWidth = (character) => {
      if (font === 'mono') return 0.62;
      if (/[MW@%]/.test(character)) return 1.02;
      if (/[mw]/.test(character)) return 0.95;
      if (/[A-Z]/.test(character)) return 0.82;
      if (/[ilI.,!:'| ]/.test(character)) return 0.4;
      if (/[a-z0-9]/.test(character)) return bold ? 0.69 : 0.65;
      return 1.1;
    };
    const measure = (value) =>
      Array.from(value).reduce((total, character) => total + glyphWidth(character) * size, 0);
    if (measure(text) <= width) return text;
    let shortened = '';
    for (const character of text) {
      if (measure(shortened + character + '...') > width) break;
      shortened += character;
    }
    return shortened + '...';
  }
  function scene(org, student) {
    const design = normalize(org.card_design),
      wide = design.orientation === 'landscape';
    const width = wide ? 510 : 320,
      height = wide ? 320 : 510;
    const template = templates.some((t) => t.id === org.template_id) ? org.template_id : 'classic';
    const background = color(org.background_color, '#ffffff'),
      ink = color(org.text_color, '#17212b'),
      accent = design.accentColor;
    const scale = { compact: 0.9, normal: 1, large: 1.1 }[design.fontSize];
    const ops = [];
    const rect = (x, y, w, h, fill, radius = 0, stroke) =>
      ops.push({ type: 'rect', x, y, w, h, fill, radius, stroke });
    const text = (value, x, y, w, size, bold = false, align = 'left', fill = ink) =>
      ops.push({
        type: 'text',
        text: fit(value, w, size, bold, design.fontFamily),
        x,
        y,
        w,
        size,
        bold,
        align,
        fill,
        font: design.fontFamily,
      });
    const image = (source, x, y, w, h, radius = 0, opacity = 1, cover = false) =>
      ops.push({ type: 'image', source, x, y, w, h, radius, opacity, cover });
    rect(0, 0, width, height, background, 10);
    if (design.showBackground && org.background_image_url)
      image('background', 0, 0, width, height, 10, 0.1, true);
    if (template === 'classic') rect(0, 0, width, 7, accent);
    if (template === 'modern') {
      rect(0, 0, width, 85, accent);
      rect(0, 85, width, 3, ink);
    }
    if (template === 'minimal') rect(8, 8, width - 16, height - 16, null, 4, accent);
    if (template === 'corporate') {
      rect(0, 0, 13, height, accent);
      rect(23, 79, width - 46, 2, accent);
    }
    if (template === 'event') {
      rect(0, 0, width, 9, accent);
      rect(16, height - 27, width - 32, 3, accent);
    }
    const headerInk = template === 'modern' ? '#ffffff' : ink;
    if (design.showLogo && org.image_url) image('logo', 22, 22, 43, 43, 5);
    const headerX = design.showLogo && org.image_url ? 75 : 23;
    text(
      org.name || 'Your organization',
      headerX,
      21,
      width - headerX - 23,
      16,
      true,
      'left',
      headerInk,
    );
    text(org.tagline || '', headerX, 46, width - headerX - 23, 9, false, 'left', headerInk);
    text(
      design.cardTitle,
      23,
      68,
      width - 46,
      template === 'event' ? 12 : 8,
      true,
      'left',
      template === 'modern' ? '#ffffff' : accent,
    );
    const photoSize = wide ? 94 : 86,
      photoX = wide ? 27 : (width - photoSize) / 2,
      photoY = wide ? 104 : 102;
    if (design.showPhoto) {
      const radius =
        design.photoShape === 'circle' ? photoSize / 2 : design.photoShape === 'rounded' ? 10 : 0;
      rect(photoX, photoY, photoSize, photoSize, '#e8edf3', radius);
      if (student.photo_url) image('photo', photoX, photoY, photoSize, photoSize, radius, 1, true);
      else
        text(
          (student.name || 'ST')
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((v) => v[0])
            .join('')
            .toUpperCase(),
          photoX + 5,
          photoY + 31,
          photoSize - 10,
          21,
          true,
          'center',
          accent,
        );
    }
    const contentX = wide ? (design.showPhoto ? 145 : 25) : 23,
      contentWidth = width - contentX - 23;
    const nameY = wide ? 104 : design.showPhoto ? 201 : 111;
    text(
      student.name || 'Student name',
      contentX,
      nameY,
      contentWidth,
      19 * scale,
      true,
      wide ? 'left' : 'center',
    );
    text(
      student.student_id || '',
      contentX,
      nameY + 29,
      contentWidth,
      11 * scale,
      false,
      wide ? 'left' : 'center',
      accent,
    );
    const lines = design.visibleFields
      .filter((key) => student[key])
      .map((key) => `${fields[key]}: ${student[key]}`);
    lines.forEach((line, index) =>
      text(
        line,
        contentX,
        nameY + 54 + index * (wide ? 15 : 21),
        contentWidth,
        (wide ? 9 : 10) * scale,
      ),
    );
    const codeY = wide ? 246 : 417;
    if (design.showQr) image('qr', 24, codeY - (wide ? 0 : 3), wide ? 44 : 56, wide ? 44 : 56);
    if (design.showBarcode)
      image('barcode', wide ? 80 : 99, codeY + 4, wide ? 155 : 197, wide ? 37 : 43);
    text(
      design.footerText,
      wide ? 250 : 23,
      wide ? 270 : 485,
      wide ? 235 : 274,
      8,
      false,
      wide ? 'right' : 'center',
    );
    return { width, height, template, design, ops };
  }
  return { templates, fields, defaults, validate, normalize, scene };
});
