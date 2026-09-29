(function (root, factory) {
  const products = factory();
  if (typeof module === 'object' && module.exports) module.exports = products;
  else root.PrintProducts = products;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return [
    {
      id: 'flex',
      name: 'Flex boards & banners',
      category: 'Signage',
      tag: 'MAKE A BIG IMPRESSION',
      description: 'Shop signs, event backdrops and outdoor promotions, made to your size.',
      options: ['Frontlit flex', 'Backlit flex', 'Vinyl board'],
      unit: 'boards',
      details: 'Share width × height, indoor or outdoor use, and fitting requirements.',
    },
    {
      id: 'wedding',
      name: 'Wedding cards',
      category: 'Invitations',
      tag: 'FOR YOUR BIG DAY',
      description: 'Personal invitations for weddings, receptions and celebrations.',
      options: ['Classic invitation', 'Premium textured card', 'Card with envelope'],
      unit: 'cards',
      details: 'Share the language, card size, paper finish and ceremony details.',
    },
    {
      id: 'mugs',
      name: 'Personalized mugs',
      category: 'Gifts',
      tag: 'A LITTLE MORE PERSONAL',
      description: 'Your photo, message or brand on a mug for gifting or your team.',
      options: ['White ceramic mug', 'Color-handle mug', 'Photo mug'],
      unit: 'mugs',
      details: 'Share the design, print sides and packaging requirements.',
    },
    {
      id: 'tshirts',
      name: 'Custom T-shirts',
      category: 'Apparel',
      tag: 'WEAR YOUR IDEA',
      description: 'Team uniforms, event tees and branded merchandise in your colors.',
      options: ['Round-neck T-shirt', 'Polo T-shirt', 'Event T-shirt'],
      unit: 'shirts',
      details: 'Share sizes, fabric preference, shirt colors and print positions.',
    },
    {
      id: 'idcards',
      name: 'ID cards & lanyards',
      category: 'Identity',
      tag: 'BELONG TO SOMETHING',
      description: 'School, staff and event IDs with photos, codes and your identity.',
      options: ['PVC ID card', 'ID card with holder', 'Card and lanyard'],
      unit: 'cards',
      details:
        'Share quantity, orientation, holder and lanyard requirements. You can design cards in our ID Card Studio.',
    },
  ];
});
