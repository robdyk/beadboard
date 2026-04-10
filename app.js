const imageUpload = document.getElementById('imageUpload');
const previewCanvas = document.getElementById('previewCanvas');
const ctx = previewCanvas.getContext('2d');
const gridSizeInput = document.getElementById('gridSize');
const gridSizeValue = document.getElementById('gridSizeValue');
const boardInfo = document.getElementById('boardInfo');
const controls = document.getElementById('controls');
const canvasContainer = document.getElementById('canvasContainer');
const actions = document.getElementById('actions');
const printBtn = document.getElementById('printBtn');

let uploadedImage = null;

function setUploadedImage(img) {
    uploadedImage = img;
}

// Standard Perler/Hama bead colors (RGB values)
const BEAD_COLORS = [
    { name: 'White', r: 255, g: 255, b: 255 },
    { name: 'Cream', r: 255, g: 245, b: 217 },
    { name: 'Yellow', r: 255, g: 236, b: 0 },
    { name: 'Orange', r: 255, g: 132, b: 0 },
    { name: 'Red', r: 221, g: 0, b: 0 },
    { name: 'Bubblegum', r: 255, g: 130, b: 133 },
    { name: 'Pink', r: 255, g: 105, b: 180 },
    { name: 'Purple', r: 128, g: 0, b: 128 },
    { name: 'Dark Blue', r: 0, g: 0, b: 139 },
    { name: 'Light Blue', r: 51, g: 153, b: 255 },
    { name: 'Turquoise', r: 64, g: 224, b: 208 },
    { name: 'Light Green', r: 144, g: 238, b: 144 },
    { name: 'Green', r: 0, g: 128, b: 0 },
    { name: 'Dark Green', r: 0, g: 100, b: 0 },
    { name: 'Brown', r: 139, g: 69, b: 19 },
    { name: 'Tan', r: 210, g: 180, b: 140 },
    { name: 'Grey', r: 128, g: 128, b: 128 },
    { name: 'Black', r: 0, g: 0, b: 0 }
];

function findClosestBeadColor(r, g, b) {
    let minDistance = Infinity;
    let closestColor = BEAD_COLORS[0];

    for (const color of BEAD_COLORS) {
        // Weighted Euclidean distance in RGB — approximates human color perception
        const rMean = (r + color.r) / 2;
        const dr = r - color.r;
        const dg = g - color.g;
        const db = b - color.b;
        const distance = Math.sqrt(
            (2 + rMean / 256) * dr * dr +
            4 * dg * dg +
            (2 + (255 - rMean) / 256) * db * db
        );

        if (distance < minDistance) {
            minDistance = distance;
            closestColor = color;
        }
    }

    return closestColor;
}

function findContentBounds(ctx, width, height) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    let minX = width, minY = height, maxX = 0, maxY = 0;
    const threshold = 240; // Consider pixels darker than this as content
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const brightness = (r + g + b) / 3;
            
            // If pixel is not white/near-white
            if (brightness < threshold) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    
    // Add small padding (2% of image size)
    const padding = Math.floor(Math.min(width, height) * 0.02);
    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = Math.min(width - 1, maxX + padding);
    maxY = Math.min(height - 1, maxY + padding);
    
    // If no content found, use full image
    if (minX >= maxX || minY >= maxY) {
        return { left: 0, top: 0, width: width, height: height };
    }
    
    return {
        left: minX,
        top: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1
    };
}

function applyEdgeDetection(imageData, width, height) {
    const output = new Uint8ClampedArray(imageData.data);
    const edges = new Array(width * height).fill(0);
    
    // Sobel operator kernels
    const sobelX = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
    const sobelY = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]];
    
    // First pass: detect edges
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            let gx = 0, gy = 0;
            
            // Apply Sobel operator
            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    const idx = ((y + ky) * width + (x + kx)) * 4;
                    const gray = (imageData.data[idx] + imageData.data[idx + 1] + imageData.data[idx + 2]) / 3;
                    
                    gx += gray * sobelX[ky + 1][kx + 1];
                    gy += gray * sobelY[ky + 1][kx + 1];
                }
            }
            
            const magnitude = Math.sqrt(gx * gx + gy * gy);
            edges[y * width + x] = magnitude;
        }
    }
    
    // Second pass: apply non-maximum suppression for thin edges
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            const magnitude = edges[idx];
            
            // Higher threshold for sharper, thinner edges (80 instead of 50)
            if (magnitude > 80) {
                // Check if this is a local maximum
                const isLocalMax = magnitude >= edges[idx - 1] && 
                                   magnitude >= edges[idx + 1] &&
                                   magnitude >= edges[idx - width] &&
                                   magnitude >= edges[idx + width];
                
                if (isLocalMax) {
                    const i = idx * 4;
                    output[i] = 0;
                    output[i + 1] = 0;
                    output[i + 2] = 0;
                }
            }
        }
    }
    
    return new ImageData(output, width, height);
}

const recentSection = document.getElementById('recentSection');
const recentTray = document.getElementById('recentTray');

const RECENT_KEY = 'beadboard_recent';
const MAX_RECENT = 8;

function loadRecent() {
    try {
        return JSON.parse(localStorage.getItem(RECENT_KEY)) || [];
    } catch { return []; }
}

function saveRecent(list) {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
}

function addToRecent(dataUrl, name) {
    let list = loadRecent();
    // Remove duplicate if same name exists
    list = list.filter(item => item.name !== name);
    list.unshift({ dataUrl, name });
    if (list.length > MAX_RECENT) list = list.slice(0, MAX_RECENT);
    saveRecent(list);
    renderRecentTray();
}

function removeFromRecent(name) {
    let list = loadRecent().filter(item => item.name !== name);
    saveRecent(list);
    renderRecentTray();
}

function renderRecentTray() {
    const list = loadRecent();
    if (list.length === 0) {
        recentSection.style.display = 'none';
        return;
    }
    recentSection.style.display = 'block';
    recentTray.innerHTML = '';
    list.forEach(item => {
        const thumb = document.createElement('div');
        thumb.className = 'recent-thumb';
        thumb.title = item.name;

        const img = document.createElement('img');
        img.src = item.dataUrl;
        img.alt = item.name;

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.textContent = '×';
        removeBtn.title = 'Remove';
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeFromRecent(item.name);
        });

        thumb.appendChild(img);
        thumb.appendChild(removeBtn);
        thumb.addEventListener('click', (e) => loadFromRecent(item, e.currentTarget));
        recentTray.appendChild(thumb);
    });
}

function loadFromRecent(item, thumbEl) {
    recentTray.querySelectorAll('.recent-thumb').forEach(t => t.classList.remove('active'));
    thumbEl.classList.add('active');

    const img = new Image();
    img.onload = function() {
        uploadedImage = img;
        controls.style.display = 'block';
        canvasContainer.style.display = 'block';
        actions.style.display = 'block';
        updatePattern();
    };
    img.src = item.dataUrl;
}

// Init tray on load
renderRecentTray();

imageUpload.addEventListener('change', handleImageUpload);
gridSizeInput.addEventListener('input', updatePattern);
printBtn.addEventListener('click', printPattern);

function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        const dataUrl = event.target.result;
        const img = new Image();
        img.onload = function() {
            uploadedImage = img;
            controls.style.display = 'block';
            canvasContainer.style.display = 'block';
            actions.style.display = 'block';
            addToRecent(dataUrl, file.name);
            updatePattern();
        };
        img.src = dataUrl;
    };
    reader.readAsDataURL(file);
}

function updatePattern() {
    if (!uploadedImage) return;

    const gridSize = parseInt(gridSizeInput.value);

    // Preserve aspect ratio — calculate grid dimensions based on image proportions
    const imgAspect = (uploadedImage.naturalWidth || uploadedImage.width) / (uploadedImage.naturalHeight || uploadedImage.height);
    let gridW, gridH;
    if (imgAspect >= 1) {
        gridW = gridSize;
        gridH = Math.max(1, Math.round(gridSize / imgAspect));
    } else {
        gridH = gridSize;
        gridW = Math.max(1, Math.round(gridSize * imgAspect));
    }

    gridSizeValue.textContent = `${gridW}×${gridH}`;

    // Update board info based on largest dimension
    const maxDim = Math.max(gridW, gridH);
    if (maxDim <= 30) {
        boardInfo.textContent = '(1×1 board)';
    } else if (maxDim <= 60) {
        boardInfo.textContent = '(2×2 boards)';
    } else {
        boardInfo.textContent = '(3×3 boards)';
    }

    // Calculate canvas size — keep beads square
    const maxSizePx = 567;
    const beadSize = Math.floor(maxSizePx / Math.max(gridW, gridH));
    const canvasW = beadSize * gridW;
    const canvasH = beadSize * gridH;

    previewCanvas.width = canvasW;
    previewCanvas.height = canvasH;

    // Create temporary canvas for image processing
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = gridW;
    tempCanvas.height = gridH;

    // Draw full image first to detect content bounds
    const detectCanvas = document.createElement('canvas');
    const detectCtx = detectCanvas.getContext('2d');
    detectCanvas.width = uploadedImage.naturalWidth || uploadedImage.width;
    detectCanvas.height = uploadedImage.naturalHeight || uploadedImage.height;
    detectCtx.drawImage(uploadedImage, 0, 0);

    // Find content bounds (non-white pixels)
    const bounds = findContentBounds(detectCtx, detectCanvas.width, detectCanvas.height);

    // Draw cropped content preserving aspect ratio into the grid
    tempCtx.fillStyle = '#ffffff';
    tempCtx.fillRect(0, 0, gridW, gridH);
    tempCtx.drawImage(
        uploadedImage,
        bounds.left, bounds.top, bounds.width, bounds.height,
        0, 0, gridW, gridH
    );
    let imageData = tempCtx.getImageData(0, 0, gridW, gridH);

    // Apply edge detection for sharp contours
    imageData = applyEdgeDetection(imageData, gridW, gridH);

    // Draw pixelated pattern with grid using bead colors
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasW, canvasH);

    for (let y = 0; y < gridH; y++) {
        for (let x = 0; x < gridW; x++) {
            const i = (y * gridW + x) * 4;
            const r = imageData.data[i];
            const g = imageData.data[i + 1];
            const b = imageData.data[i + 2];

            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            ctx.fillRect(x * beadSize, y * beadSize, beadSize, beadSize);

            ctx.strokeStyle = 'rgba(0,0,0,0.15)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x * beadSize, y * beadSize, beadSize, beadSize);
        }
    }
}

function printPattern() {
    const gridSize = parseInt(gridSizeInput.value);

    // Preserve aspect ratio for print too
    const imgAspect = (uploadedImage.naturalWidth || uploadedImage.width) / (uploadedImage.naturalHeight || uploadedImage.height);
    let gridW, gridH;
    if (imgAspect >= 1) {
        gridW = gridSize;
        gridH = Math.max(1, Math.round(gridSize / imgAspect));
    } else {
        gridH = gridSize;
        gridW = Math.max(1, Math.round(gridSize * imgAspect));
    }

    // Determine board configuration based on largest dimension
    const maxDim = Math.max(gridW, gridH);
    let boardsPerSide;
    if (maxDim <= 30) {
        boardsPerSide = 1;
    } else if (maxDim <= 60) {
        boardsPerSide = 2;
    } else {
        boardsPerSide = 3;
    }

    const beadsPerBoard = 30;
    const printSizePx = Math.round((15 / 2.54) * 300);
    const beadSize = printSizePx / beadsPerBoard;

    // Create full pattern canvas
    const fullCanvas = document.createElement('canvas');
    const fullCtx = fullCanvas.getContext('2d');
    fullCanvas.width = gridW;
    fullCanvas.height = gridH;

    // Draw full image first to detect content bounds
    const detectCanvas = document.createElement('canvas');
    const detectCtx = detectCanvas.getContext('2d');
    detectCanvas.width = uploadedImage.naturalWidth || uploadedImage.width;
    detectCanvas.height = uploadedImage.naturalHeight || uploadedImage.height;
    detectCtx.drawImage(uploadedImage, 0, 0);

    const bounds = findContentBounds(detectCtx, detectCanvas.width, detectCanvas.height);

    fullCtx.fillStyle = '#ffffff';
    fullCtx.fillRect(0, 0, gridW, gridH);
    fullCtx.drawImage(
        uploadedImage,
        bounds.left, bounds.top, bounds.width, bounds.height,
        0, 0, gridW, gridH
    );
    let imageData = fullCtx.getImageData(0, 0, gridW, gridH);

    // Apply edge detection
    imageData = applyEdgeDetection(imageData, gridW, gridH);

    // Hide original UI elements
    const originalDisplay = {
        upload: document.querySelector('.upload-section').style.display,
        controls: controls.style.display,
        actions: actions.style.display,
        h1: document.querySelector('h1').style.display
    };
    
    document.querySelector('.upload-section').style.display = 'none';
    controls.style.display = 'none';
    actions.style.display = 'none';
    document.querySelector('h1').style.display = 'none';
    previewCanvas.style.display = 'none';

    // Clear canvas container and add print pages
    const originalContent = canvasContainer.innerHTML;
    canvasContainer.innerHTML = '';

    // Generate each board page
    for (let boardY = 0; boardY < boardsPerSide; boardY++) {
        for (let boardX = 0; boardX < boardsPerSide; boardX++) {
            const pageCanvas = document.createElement('canvas');
            const pageCtx = pageCanvas.getContext('2d');
            pageCanvas.width = printSizePx;
            pageCanvas.height = printSizePx;
            pageCanvas.className = 'print-page';

            pageCtx.fillStyle = '#ffffff';
            pageCtx.fillRect(0, 0, printSizePx, printSizePx);

            // Calculate which beads go on this board
            const startX = boardX * beadsPerBoard;
            const startY = boardY * beadsPerBoard;
            const endX = Math.min(startX + beadsPerBoard, gridW);
            const endY = Math.min(startY + beadsPerBoard, gridH);

            // Draw beads for this board
            for (let y = startY; y < endY; y++) {
                for (let x = startX; x < endX; x++) {
                    const i = (y * gridW + x) * 4;
                    const r = imageData.data[i];
                    const g = imageData.data[i + 1];
                    const b = imageData.data[i + 2];

                    pageCtx.fillStyle = `rgb(${r}, ${g}, ${b})`;

                    const drawX = (x - startX) * beadSize;
                    const drawY = (y - startY) * beadSize;
                    pageCtx.fillRect(drawX, drawY, beadSize, beadSize);

                    pageCtx.strokeStyle = 'rgba(0,0,0,0.15)';
                    pageCtx.lineWidth = 2;
                    pageCtx.strokeRect(drawX, drawY, beadSize, beadSize);
                }
            }

            // Add page label
            pageCtx.fillStyle = '#000000';
            pageCtx.font = 'bold 40px Arial';
            const pageNum = boardY * boardsPerSide + boardX + 1;
            const totalPages = boardsPerSide * boardsPerSide;
            pageCtx.fillText(`Page ${pageNum}/${totalPages} (Row ${boardY + 1}, Col ${boardX + 1})`, 20, 50);

            canvasContainer.appendChild(pageCanvas);
        }
    }

    // Print
    setTimeout(() => {
        window.print();
        
        // Restore UI after print dialog closes
        setTimeout(() => {
            canvasContainer.innerHTML = originalContent;
            document.querySelector('.upload-section').style.display = originalDisplay.upload;
            controls.style.display = originalDisplay.controls;
            actions.style.display = originalDisplay.actions;
            document.querySelector('h1').style.display = originalDisplay.h1;
            previewCanvas.style.display = 'block';
        }, 500);
    }, 100);
}
