(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.PrintOptions=value;})(globalThis,function(){
  const presets = [
    {id:'id-portrait',name:'ID card · 54 × 86 mm',product:'idcards',widthMm:54,heightMm:86},
    {id:'id-landscape',name:'ID card · 86 × 54 mm',product:'idcards',widthMm:86,heightMm:54},
    {id:'wedding',name:'Wedding invitation · 5 × 7 in',product:'wedding',widthMm:127,heightMm:177.8},
    {id:'postcard',name:'Postcard · 148 × 105 mm',product:'wedding',widthMm:148,heightMm:105},
    {id:'mug',name:'Mug transfer · 210 × 95 mm',product:'mugs',widthMm:210,heightMm:95},
    {id:'tshirt',name:'T-shirt transfer · A4',product:'tshirts',widthMm:210,heightMm:297},
    {id:'flex-small',name:'Flex board · 600 × 900 mm',product:'flex',widthMm:600,heightMm:900},
    {id:'flex-large',name:'Flex board · 900 × 1800 mm',product:'flex',widthMm:900,heightMm:1800},
  ];
  function validate(value){
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Choose print dimensions.');
    for(const key of ['widthMm','heightMm'])if(typeof value[key]!=='number'||!Number.isFinite(value[key])||value[key]<10||value[key]>2000)throw Error('Width and height must be between 10 and 2,000 mm.');
    const result={widthMm:Number(value.widthMm.toFixed(3)),heightMm:Number(value.heightMm.toFixed(3)),paper:value.paper||'match',landscape:value.landscape??false,marginMm:value.marginMm??0,fit:value.fit||'contain',copies:value.copies??1};
    if(!['match','A4','A3','Letter'].includes(result.paper)||!['contain','cover'].includes(result.fit)||typeof result.landscape!=='boolean')throw Error('Choose valid paper and image fit.');
    if(typeof result.marginMm!=='number'||!Number.isFinite(result.marginMm)||result.marginMm<0||result.marginMm>25)throw Error('Margins must be between 0 and 25 mm.');
    if(!Number.isInteger(result.copies)||result.copies<1||result.copies>20)throw Error('Prepare between 1 and 20 copies per batch.');
    const [paperWidth,paperHeight]=pageSize(result);
    if(result.widthMm>paperWidth-2*result.marginMm+0.001||result.heightMm>paperHeight-2*result.marginMm+0.001)throw Error('The item does not fit this paper and margin. Choose larger paper or Match item size.');
    return result;
  }
  function pageSize(value){
    if(value.paper==='match')return [value.widthMm+2*value.marginMm,value.heightMm+2*value.marginMm];
    const size={A4:[210,297],A3:[297,420],Letter:[215.9,279.4]}[value.paper];
    return value.landscape?[size[1],size[0]]:[...size];
  }
  function placement(layout,sourceWidth,sourceHeight){const [pw,ph]=pageSize(layout),scale=Math[layout.fit==='cover'?'max':'min'](layout.widthMm/sourceWidth,layout.heightMm/sourceHeight);return {pageWidth:pw,pageHeight:ph,x:(pw-layout.widthMm)/2,y:(ph-layout.heightMm)/2,width:sourceWidth*scale,height:sourceHeight*scale,offsetX:(layout.widthMm-sourceWidth*scale)/2,offsetY:(layout.heightMm-sourceHeight*scale)/2,scale};}
  return {presets,validate,pageSize,placement};
});
