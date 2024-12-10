// 获取DOM元素
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const imageProcessing = document.getElementById('imageProcessing');
const originalPreview = document.getElementById('originalPreview');
const compressedPreview = document.getElementById('compressedPreview');
const originalInfo = document.getElementById('originalInfo');
const compressedInfo = document.getElementById('compressedInfo');
const qualitySlider = document.getElementById('quality');
const qualityValue = document.getElementById('qualityValue');
const compressBtn = document.getElementById('compressBtn');
const downloadBtn = document.getElementById('downloadBtn');

let originalFile = null;
let compressedBlob = null;

// 在文件顶部添加压缩状态管理
const compressionState = {
    isCompressing: false,
    currentImage: null,  // 当前要处理的图片(可能是原图或已压缩的图片)
    compressionCount: 0  // 压缩次数
};

// 修改压缩配置对象
const compressionConfig = {
    // PNG 压缩选项
    png: {
        quality: 0.8,
        // 颜色深度相关配置
        colorDepth: 8,  // 8 或 24
        // 是否尝试将 PNG 转换为 JPEG 以获得更小的文件大小
        convertToJpeg: false
    },
    // JPEG 压缩选项
    jpeg: {
        quality: 0.8,
        // 是否启用渐进式JPEG
        progressive: true
    },
    // 通用配置
    common: {
        // 最大尺寸限制
        maxWidth: 1920,
        maxHeight: 1080,
        // 压缩时的最小文件大小(小于这个值不压缩)
        minFileSize: 10 * 1024, // 10KB
        // 目标文件大小(压缩时会尽量接近这个值)
        targetFileSize: 200 * 1024 // 200KB
    }
};

// 添加智能压缩配置
const smartCompressionConfig = {
    // 目标压缩比例（相对于原始文件大小）
    targetRatio: {
        jpeg: 0.7, // JPEG目标为原大小的70%
        png: 0.8   // PNG目标为原大小的80%
    },
    // 质量建议范围
    qualityRange: {
        jpeg: {
            min: 40,
            max: 90,
            default: 75
        },
        png: {
            min: 60,
            max: 95,
            default: 85
        }
    },
    // 文件大小阈值（单位：字节）
    thresholds: {
        small: 500 * 1024,    // 500KB
        medium: 2 * 1024 * 1024, // 2MB
        large: 5 * 1024 * 1024   // 5MB
    }
};

// 添加图片分析结果存储
const imageAnalysis = {
    originalSize: 0,
    format: '',
    complexity: 0, // 图片复杂度（0-1）
    suggestedQuality: 0,
    estimatedSize: 0
};

// 上传区域点击事件
uploadArea.addEventListener('click', () => {
    fileInput.click();
});

// 拖放功能
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '#007AFF';
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.style.borderColor = '#E5E5E5';
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '#E5E5E5';
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
});

// 文件选择事件
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
});

// 修改处理上传文件的函数
async function handleFile(file) {
    if (!file.type.startsWith('image/')) {
        alert('请上传图片文件！');
        return;
    }

    originalFile = file;
    imageAnalysis.originalSize = file.size;
    imageAnalysis.format = file.type.includes('jpeg') ? 'jpeg' : 'png';
    
    const reader = new FileReader();
    
    reader.onload = async (e) => {
        originalPreview.src = e.target.result;
        imageProcessing.style.display = 'block';
        updateFileInfo(originalInfo, file);
        
        // 分析图片并设置建议值
        await analyzeImage(file);
        
        // 更新UI显示
        updateCompressionSuggestion();
        updateSizeEstimate();
        
        compressBtn.disabled = false;
        downloadBtn.disabled = true;
        compressedPreview.src = '';
        compressedInfo.innerHTML = '<span class="file-size">大小: -</span><span class="file-dimensions">尺寸: -</span>';
    };

    reader.readAsDataURL(file);
}

// 添加图片分析函数
async function analyzeImage(file) {
    const img = await loadImage(file);
    
    // 计算图片复杂度
    imageAnalysis.complexity = await calculateImageComplexity(img);
    
    // 根据文件大小和复杂度计算建议质量
    imageAnalysis.suggestedQuality = calculateSuggestedQuality(
        file.size,
        imageAnalysis.format,
        imageAnalysis.complexity
    );
    
    // 更新质量滑块的值
    qualitySlider.value = imageAnalysis.suggestedQuality;
    qualityValue.textContent = imageAnalysis.suggestedQuality + '%';
    
    // 预估压缩后的文件大小
    imageAnalysis.estimatedSize = estimateCompressedSize(
        file.size,
        imageAnalysis.suggestedQuality,
        imageAnalysis.format,
        imageAnalysis.complexity
    );
}

// 计算图片复杂度
async function calculateImageComplexity(img) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // 缩放到较小尺寸以加快计算
    const scale = Math.min(1, 400 / Math.max(img.width, img.height));
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // 计算相邻像素的平均差异
    let totalDiff = 0;
    for (let i = 0; i < data.length; i += 4) {
        if (i + 4 < data.length) {
            totalDiff += Math.abs(data[i] - data[i + 4]);
            totalDiff += Math.abs(data[i + 1] - data[i + 5]);
            totalDiff += Math.abs(data[i + 2] - data[i + 6]);
        }
    }
    
    // 归一化复杂度值到0-1范围
    return Math.min(1, totalDiff / (data.length * 255));
}

// 计算建议质量值
function calculateSuggestedQuality(fileSize, format, complexity) {
    const config = smartCompressionConfig.qualityRange[format];
    let suggestedQuality = config.default;
    
    // 根据文件大小调整
    if (fileSize > smartCompressionConfig.thresholds.large) {
        suggestedQuality = config.min + Math.round((config.max - config.min) * 0.3);
    } else if (fileSize > smartCompressionConfig.thresholds.medium) {
        suggestedQuality = config.min + Math.round((config.max - config.min) * 0.5);
    } else if (fileSize > smartCompressionConfig.thresholds.small) {
        suggestedQuality = config.min + Math.round((config.max - config.min) * 0.7);
    }
    
    // 根据复杂度调整
    suggestedQuality += Math.round((1 - complexity) * 10);
    
    // 确保在有效范围内
    return Math.max(config.min, Math.min(config.max, suggestedQuality));
}

// 预估压缩后的文件大小
function estimateCompressedSize(originalSize, quality, format, complexity) {
    const baseRatio = quality / 100;
    let estimatedRatio;
    
    if (format === 'jpeg') {
        // JPEG的压缩比与质量不是线性关系
        estimatedRatio = Math.pow(baseRatio, 1.5);
    } else {
        // PNG的压缩效果与图片复杂度关系更大
        estimatedRatio = baseRatio * (0.8 + complexity * 0.2);
    }
    
    return Math.round(originalSize * estimatedRatio);
}

// 更新压缩建议显示
function updateCompressionSuggestion() {
    const suggestionElement = document.getElementById('compressionSuggestion');
    const format = imageAnalysis.format;
    const quality = imageAnalysis.suggestedQuality;
    
    suggestionElement.innerHTML = `
        建议质量: ${quality}%<br>
        建议格式: ${format === 'jpeg' ? 'JPEG' : 'PNG'}
    `;
}

// 更新预估大小显示
function updateSizeEstimate() {
    const estimateElement = document.getElementById('sizeEstimate');
    const quality = parseInt(qualitySlider.value);
    const estimatedSize = estimateCompressedSize(
        imageAnalysis.originalSize,
        quality,
        imageAnalysis.format,
        imageAnalysis.complexity
    );
    
    estimateElement.innerHTML = `
        预计: ${formatFileSize(estimatedSize)}<br>
        压缩率: ${Math.round((estimatedSize / imageAnalysis.originalSize) * 100)}%
    `;
}

// 更新文件信息
function updateFileInfo(infoElement, file) {
    const img = new Image();
    img.onload = () => {
        const size = formatFileSize(file.size);
        const dimensions = `${img.width} × ${img.height}`;
        infoElement.innerHTML = `
            <span class="file-size">大小: ${size}</span>
            <span class="file-dimensions">尺寸: ${dimensions}</span>
        `;
    };
    img.src = URL.createObjectURL(file);
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 修改质量滑块事件
qualitySlider.addEventListener('input', (e) => {
    const quality = e.target.value;
    qualityValue.textContent = quality + '%';
    updateSizeEstimate();
});

// 修改压缩按钮事件处理
compressBtn.addEventListener('click', async () => {
    if (compressionState.isCompressing) return; // 防止重复点击
    
    try {
        compressionState.isCompressing = true;
        compressBtn.disabled = true;
        compressBtn.textContent = '压缩中...';
        
        // 使用当前显示的图片作为源
        const sourceImage = compressionState.compressionCount === 0 ? 
            originalFile : compressedBlob;
            
        await compressImage(sourceImage);
        compressionState.compressionCount++;
        
    } catch (error) {
        console.error('压缩失败:', error);
        alert('图片压缩失败，请重试');
    } finally {
        compressionState.isCompressing = false;
        compressBtn.disabled = false;
        compressBtn.textContent = '压缩图片';
    }
});

// 修改压缩图片函数
async function compressImage(file) {
    // 更新当前处理的图片
    compressionState.currentImage = file;
    
    const img = await loadImage(file);
    const canvas = document.createElement('canvas');
    
    // 获取压缩参数
    const quality = parseInt(qualitySlider.value) / 100;
    const outputFormat = document.getElementById('outputFormat').value;
    
    // 确定输出格式
    const isPNG = file.type.includes('png');
    const targetFormat = outputFormat === 'auto' ? 
        file.type : 
        outputFormat === 'jpeg' ? 'image/jpeg' : 'image/png';
    
    // 计算新尺寸
    let { width, height } = calculateNewDimensions(
        img.width, 
        img.height,
        targetFormat.includes('jpeg')
    );
    
    canvas.width = width;
    canvas.height = height;
    
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // 如果是PNG且不转换为JPEG，使用特殊的PNG优化
    if (isPNG && targetFormat === 'image/png') {
        await optimizePNG(ctx, img, width, height);
    } else {
        ctx.drawImage(img, 0, 0, width, height);
    }
    
    const blob = await compressToBlob(canvas, targetFormat, quality);
    handleCompressedImage(blob);
}

// 添加PNG优化函数
async function optimizePNG(ctx, img, width, height) {
    // 如果是8位PNG，使用调色板优化
    if (compressionConfig.png.colorDepth === 8) {
        // 创建一个临时canvas用于颜色处理
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d');
        
        // 绘制原图
        tempCtx.drawImage(img, 0, 0, width, height);
        
        // 获取图像数据
        const imageData = tempCtx.getImageData(0, 0, width, height);
        const data = imageData.data;
        
        // 颜色量化处理(减少颜色数量)
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.round(data[i] / 32) * 32;     // R
            data[i + 1] = Math.round(data[i + 1] / 32) * 32; // G
            data[i + 2] = Math.round(data[i + 2] / 32) * 32; // B
        }
        
        // 将处理后的图像数据绘制回主canvas
        ctx.putImageData(imageData, 0, 0);
    } else {
        // 24位PNG直接绘制
        ctx.drawImage(img, 0, 0, width, height);
    }
}

// 添加Blob压缩函数
function compressToBlob(canvas, format, quality) {
    return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), format, quality);
    });
}

// 修改图片加载函数
function loadImage(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}

// 修改计算新尺寸的函数
function calculateNewDimensions(width, height, convertToJpeg) {
    const MAX_WIDTH = convertToJpeg ? 1280 : 1920;  // PNG转JPG时使用更小的尺寸
    const MAX_HEIGHT = convertToJpeg ? 720 : 1080;
    
    let newWidth = width;
    let newHeight = height;
    
    if (width > MAX_WIDTH) {
        newWidth = MAX_WIDTH;
        newHeight = Math.round(height * (MAX_WIDTH / width));
    }
    
    if (newHeight > MAX_HEIGHT) {
        newHeight = MAX_HEIGHT;
        newWidth = Math.round(width * (MAX_HEIGHT / height));
    }
    
    return { width: newWidth, height: newHeight };
}

// 修改处理压缩后图片的函数
function handleCompressedImage(blob) {
    // 如果压缩后的图片比原图大，且这是第一次压缩，则使用原图
    if (blob.size >= originalFile.size && compressionState.compressionCount === 0) {
        compressedBlob = originalFile;
        compressedPreview.src = URL.createObjectURL(originalFile);
        updateFileInfo(compressedInfo, originalFile);
    } else {
        compressedBlob = blob;
        compressedPreview.src = URL.createObjectURL(blob);
        updateFileInfo(compressedInfo, blob);
    }
    downloadBtn.disabled = false;
}

// 下载按钮事件
downloadBtn.addEventListener('click', () => {
    if (!compressedBlob) return;
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(compressedBlob);
    link.download = 'compressed_' + originalFile.name;
    link.click();
}); 