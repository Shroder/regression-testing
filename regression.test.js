jest.setTimeout(30000);

const puppeteer = require('puppeteer');
const crypto = require('crypto');
var PNG = require('pngjs').PNG;
const pixelmatch = require('pixelmatch');
const sharp = require("sharp")

const {
    performance,
    PerformanceObserver
} = require('perf_hooks');


const regression_dir = 'regression_screenshots/';
const overlay_dir = 'overlay_dir/';
const regression_dir_compare = 'regression_screenshots_compare/';
const diff_dir = 'regression_diff/';

var fs = require('fs');
if(!fs.existsSync(regression_dir)) {
    fs.mkdirSync(regression_dir);
}

if(!fs.existsSync(diff_dir)) {
    fs.mkdirSync(diff_dir);
}

function _fieldExists(field) {
    expect(field).toBeDefined();
    expect(field.length).toBeGreaterThan(0);
    expect(field[0]).toBeDefined();
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
                fs.writeFileSync('test_dir/' + full_filename, outputBuffer);
                img = PNG.sync.read(fs.readFileSync('test_dir/'+ full_filename))
                resolve(img);
            })
    
        } else {
            img = PNG.sync.read(fs.readFileSync(source_dir + filename))
            resolve(img);
        }
    })
}
// 6381 (live)
// 6363 (compare) (18 pixels)
function compareScreenshots(filename) {
    return new Promise((resolve, reject) => {
        console.log("Starting compare for " + filename + "...");
        performance.mark(`compare-${filename}-start`);

        apply_mask(regression_dir, filename, 'image_1').then(function(img1) {
            //const img2 = PNG.sync.read(fs.readFileSync(regression_dir_compare + filename));
            apply_mask(regression_dir_compare, filename, 'image_2').then(function(img2) {
                if(img1.width != img2.width || img1.height != img2.height) {
                    reject("Image sizes don't match");
                }
    
                // Do the visual diff
                const diff = new PNG({width: img1.width, height: img2.height});
                const num_diff_pixels = pixelmatch(img1.data, img2.data, diff.data, img1.width, img1.height, {threshold: 0.1});
        
                if(num_diff_pixels > 0) {
                    console.log(filename + " diffs found");
                    fs.writeFileSync(diff_dir + filename, PNG.sync.write(diff));
                }
    
                console.log("Completed compare for " + filename);
                performance.mark(`compare-${filename}-stop`);
                performance.measure(`Compare ${filename}`, `compare-${filename}-start`, `compare-${filename}-start`, `compare-${filename}-stop`)
                resolve(num_diff_pixels);
            })
        });        
    })
}

describe('webpage regression testing', () => {
    afterEach(() => {
        const obs = new PerformanceObserver((list, observer) => {
            console.log(list.getEntries()[0]);
            performance.clearMarks();
            observer.disconnect();
          });
          obs.observe({ entryTypes: ['measure'], buffered: true });
    })

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
            await page.screenshot({path: regression_dir + screenshot_filename, fullPage: true});

            let diff_pixels = await compareScreenshots(screenshot_filename);
            expect(diff_pixels).toBe(0);
            
            await browser.close();
        });        
    }
})