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
        const distance = Math.sqrt(
            Math.pow(r - color.r, 2) +
            Math.pow(g - color.g, 2) +
            Math.pow(b - color.b, 2)
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

imageUpload.addEventListener('change', handleImageUpload);
gridSizeInput.addEventListener('input', updatePattern);
printBtn.addEventListener('click', printPattern);

function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
            uploadedImage = img;
            controls.style.display = 'block';
            canvasContainer.style.display = 'block';
            actions.style.display = 'block';
            updatePattern();
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

function updatePattern() {
    if (!uploadedImage) return;

    const gridSize = parseInt(gridSizeInput.value);
    gridSizeValue.textContent = `${gridSize}×${gridSize}`;
    
    // Update board info
    if (gridSize <= 30) {
        boardInfo.textContent = '(1×1 board)';
    } else if (gridSize <= 60) {
        boardInfo.textContent = '(2×2 boards)';
    } else {
        boardInfo.textContent = '(3×3 boards)';
    }

    // Calculate canvas size for 15cm at 96 DPI (standard screen resolution)
    // 15cm = ~5.9 inches = ~567 pixels at 96 DPI
    const maxSizePx = 567;
    const beadSize = Math.floor(maxSizePx / gridSize);
    const canvasSize = beadSize * gridSize;

    previewCanvas.width = canvasSize;
    previewCanvas.height = canvasSize;

    // Create temporary canvas for image processing
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = gridSize;
    tempCanvas.height = gridSize;

    // Draw full image first to detect content bounds
    const detectCanvas = document.createElement('canvas');
    const detectCtx = detectCanvas.getContext('2d');
    detectCanvas.width = uploadedImage.width;
    detectCanvas.height = uploadedImage.height;
    detectCtx.drawImage(uploadedImage, 0, 0);
    
    // Find content bounds (non-white pixels)
    const bounds = findContentBounds(detectCtx, uploadedImage.width, uploadedImage.height);
    
    // Draw cropped content to fill the entire grid
    tempCtx.fillStyle = '#ffffff';
    tempCtx.fillRect(0, 0, gridSize, gridSize);
    tempCtx.drawImage(
        uploadedImage,
        bounds.left, bounds.top, bounds.width, bounds.height,
        0, 0, gridSize, gridSize
    );
    let imageData = tempCtx.getImageData(0, 0, gridSize, gridSize);
    
    // Apply edge detection for sharp contours
    imageData = applyEdgeDetection(imageData, gridSize, gridSize);

    // Draw pixelated pattern with grid using bead colors
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
            const i = (y * gridSize + x) * 4;
            const r = imageData.data[i];
            const g = imageData.data[i + 1];
            const b = imageData.data[i + 2];

            // Map to closest bead color
            const beadColor = findClosestBeadColor(r, g, b);
            ctx.fillStyle = `rgb(${beadColor.r}, ${beadColor.g}, ${beadColor.b})`;
            ctx.fillRect(x * beadSize, y * beadSize, beadSize, beadSize);

            // Draw grid lines
            ctx.strokeStyle = '#cccccc';
            ctx.lineWidth = 1;
            ctx.strokeRect(x * beadSize, y * beadSize, beadSize, beadSize);
        }
    }
}

function printPattern() {
    const gridSize = parseInt(gridSizeInput.value);
    
    // Determine board configuration
    let boardsPerSide;
    if (gridSize <= 30) {
        boardsPerSide = 1;
    } else if (gridSize <= 60) {
        boardsPerSide = 2;
    } else {
        boardsPerSide = 3;
    }
    
    const beadsPerBoard = 30; // Standard board is always 30×30
    const printSizePx = Math.round((15 / 2.54) * 300); // 15cm at 300 DPI = 1772px
    const beadSize = printSizePx / beadsPerBoard;

    // Create full pattern canvas
    const fullCanvas = document.createElement('canvas');
    const fullCtx = fullCanvas.getContext('2d');
    fullCanvas.width = gridSize;
    fullCanvas.height = gridSize;

    // Draw full image first to detect content bounds
    const detectCanvas = document.createElement('canvas');
    const detectCtx = detectCanvas.getContext('2d');
    detectCanvas.width = uploadedImage.width;
    detectCanvas.height = uploadedImage.height;
    detectCtx.drawImage(uploadedImage, 0, 0);
    
    const bounds = findContentBounds(detectCtx, uploadedImage.width, uploadedImage.height);
    
    fullCtx.fillStyle = '#ffffff';
    fullCtx.fillRect(0, 0, gridSize, gridSize);
    fullCtx.drawImage(
        uploadedImage,
        bounds.left, bounds.top, bounds.width, bounds.height,
        0, 0, gridSize, gridSize
    );
    let imageData = fullCtx.getImageData(0, 0, gridSize, gridSize);
    
    // Apply edge detection
    imageData = applyEdgeDetection(imageData, gridSize, gridSize);

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
            const endX = Math.min(startX + beadsPerBoard, gridSize);
            const endY = Math.min(startY + beadsPerBoard, gridSize);

            // Draw beads for this board
            for (let y = startY; y < endY; y++) {
                for (let x = startX; x < endX; x++) {
                    const i = (y * gridSize + x) * 4;
                    const r = imageData.data[i];
                    const g = imageData.data[i + 1];
                    const b = imageData.data[i + 2];

                    const beadColor = findClosestBeadColor(r, g, b);
                    pageCtx.fillStyle = `rgb(${beadColor.r}, ${beadColor.g}, ${beadColor.b})`;
                    
                    const drawX = (x - startX) * beadSize;
                    const drawY = (y - startY) * beadSize;
                    pageCtx.fillRect(drawX, drawY, beadSize, beadSize);

                    pageCtx.strokeStyle = '#999999';
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
