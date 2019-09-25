jest.setTimeout(60000);

const puppeteer = require('puppeteer');
const crypto = require('crypto');
var PNG = require('pngjs').PNG;
const pixelmatch = require('pixelmatch');
const sharp = require("sharp")

// const {
//     performance,
//     PerformanceObserver
// } = require('perf_hooks');

if(!process.env.COMPARE_DIR) {
    console.log("Comparison directory is expected in environment variable COMPARE_DIR");
    process.exit(0);
}

/**
 * Create folders used to compare screenshots
 */
const root_dir = process.env.ROOT_SCREENSHOT_DIR; // Location to put current screenshots
const original_dir = root_dir + 'original/'; // Location for all current screenshots
const overlay_dir = root_dir + 'overlay/'; // Location for overlays (ex. to cover JS animations)
const diff_dir = root_dir + 'diffs/'; // If there is a diff, screenshot showing diff stored here
const composite_dir = root_dir + 'composite/';
const resize_dir = root_dir + 'resize/';
const compare_dir = process.env.COMPARE_DIR; // Location of old screenshots, should be argument

// console.log("\n\n\n");
// console.log("##############");
// console.log("Root Directory: ", root_dir);
// console.log("original_dir: ", original_dir);
// console.log("Overlay Dir: ", overlay_dir);
// console.log("Diff Dir: ", diff_dir);
// console.log("Composite Dir: ", composite_dir);
// console.log("Compare Dir: ", compare_dir);
// console.log("##############");
// console.log("\n\n\n");

var fs = require('fs');

if(!fs.existsSync(root_dir)) {
    fs.mkdirSync(root_dir);
}

if(!fs.existsSync(original_dir)) {
    fs.mkdirSync(original_dir);
}

if(!fs.existsSync(diff_dir)) {
    fs.mkdirSync(diff_dir);
}

if(!fs.existsSync(composite_dir)) {
    fs.mkdirSync(composite_dir);
}

if(!fs.existsSync(resize_dir)) {
    fs.mkdirSync(resize_dir);
}

async function apply_mask(source_dir, filename, alias) {
    return new Promise((resolve, reject) => {
        let img;

        if(fs.existsSync(overlay_dir + filename)) {
            let full_filename = alias + '_' + filename;

            sharp(source_dir + filename)
            .composite([{ input: overlay_dir + filename, top: 0, left: 0 }])
            .toBuffer()
            .then(function(outputBuffer) {
                fs.writeFileSync(composite_dir + full_filename, outputBuffer);
                img = PNG.sync.read(fs.readFileSync(composite_dir + full_filename))
                resolve(img);
            })
    
        } else {
            img = PNG.sync.read(fs.readFileSync(source_dir + filename))
            resolve(img);
        }
    })
}

async function resizeImageMaxHeight(file_source, max_height, filename, alias) {
    var options = { colorType: 6 };
    let buffer = PNG.sync.write(file_source, options);
    let full_filename = alias + '_' + file_source.width + "_" + max_height + " +" + filename;

    
    return await sharp(buffer)
    .resize(file_source.width, max_height)
    .toBuffer()
    .then(function (outputBuffer) {
        fs.writeFileSync(resize_dir + full_filename, outputBuffer);
        img = PNG.sync.read(fs.readFileSync(resize_dir + full_filename));
        console.log(img)
        return img;
    })

}

function compareScreenshots(filename) {
    return new Promise((resolve, reject) => {
        console.log("Starting compare for " + filename + "...");
        // performance.mark(`compare-${filename}-start`);

        if(!fs.existsSync(original_dir + filename)) {
            console.log("Original file does not exist: " + original_dir + filename);
            reject("original file doesn't exist");
            return;
        }

        if(!fs.existsSync(compare_dir + filename)) {
            console.log("Compare file doesn't exist: " + compare_dir + filename);
            reject("Compare file doesn't exist");
            return;
        }

        apply_mask(original_dir, filename, 'image_1').then(function(img1) {
            //const img2 = PNG.sync.read(fs.readFileSync(original_dir_compare + filename));
            apply_mask(compare_dir, filename, 'image_2').then(function(img2) {
                if(img1.width != img2.width || img1.height != img2.height) {
                    reject("Image sizes don't match");
                }
    
                // Do the visual diff
                const max_image_height = Math.max(img1.height, img2.height)               
                img1 = resizeImageMaxHeight(img1, max_image_height, filename, 'image_1');
                img2 = resizeImageMaxHeight(img2, max_image_height, filename, 'image_2');

                Promise.all([img1, img2])
                .then(function (values) {
                    img1 = values[0];
                    img2 = values[1];

                    const diff = new PNG({width: img1.width, height: max_image_height});
                    const num_diff_pixels = pixelmatch(img1.data, img2.data, diff.data, img1.width, max_image_height, {threshold: 0.1});
            
                    if(num_diff_pixels > 0) {
                        console.log(filename + " diffs found");
                        fs.writeFileSync(diff_dir + filename, PNG.sync.write(diff));
                    }
        
                    console.log("Completed compare for " + filename);
                    //performance.mark(`compare-${filename}-stop`);
                    //performance.measure(`Compare ${filename}`, `compare-${filename}-start`, `compare-${filename}-start`, `compare-${filename}-stop`)
                    resolve(num_diff_pixels);
                });
            })
        });        
    })
}

describe('webpage regression testing', () => {
    /*
    afterEach(() => {
        const obs = new PerformanceObserver((list, observer) => {
            console.log(list.getEntries()[0]);
            performance.clearMarks();
            observer.disconnect();
          });
          obs.observe({ entryTypes: ['measure'], buffered: true });
    })
    */

    let webpages = [
        'https://shroder.github.io/regression-testing/',
    ]
    
    for(let i in webpages) {
        let url = webpages[i];
        it('regression testing for ' + url, async () => {
            const browser = await puppeteer.launch();
            const page = await browser.newPage();
            await page.goto(url);
                
            var md5sum = crypto.createHash('md5');
            let hash = md5sum.update(url);
            let screenshot_filename = md5sum.digest('hex') + '.png';
            await page.screenshot({path: original_dir + screenshot_filename, fullPage: true});

            let diff_pixels = await compareScreenshots(screenshot_filename)
            .catch(error => { 
                console.log("### Error while getting different pixels");
                console.log(error); 
                return 0; 
            });
            expect(diff_pixels).toBe(0);
            
            await browser.close();
        });        
    }
})