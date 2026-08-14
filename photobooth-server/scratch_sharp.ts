import sharp from 'sharp';

async function test() {
  try {
    const base = sharp({
      create: { width: 150, height: 150, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    });

    const overlay = await sharp({
      create: { width: 120, height: 120, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } }
    }).png().toBuffer();

    const composited = await base.composite([{ input: overlay, top: 10, left: 10 }])
      .png().toBuffer();
      
    await sharp(composited).extract({ left: 0, top: 0, width: 100, height: 100 })
      .png().toBuffer();
    console.log("Success with composite + extract");
  } catch (err: any) {
    console.log("Error with bounds overflow:", err.message);
  }
}

test();
