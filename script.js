// تفاعل الزر عند الضغط عليه
document.getElementById('notifyBtn').addEventListener('click', function() {
    alert('🎉 أهلاً بك! هذا إشعار تفاعلي يعمل داخل تطبيق الأندرويد الخاص بك بكفاءة.');
});

// تهيئة الخريطة النظامية عند تحميل الصفحة
window.addEventListener('DOMContentLoaded', function () {
    // إحداثيات افتراضية (مثلاً وسط المدينة أو نقطة معينة)، مع مستوى تكبير (Zoom)
    // يمكنك تعديل الأرقام لتناسب موقعك الحقيقي
    const defaultLat = 33.5138; 
    const defaultLng = 36.2765;

    // بناء الخريطة داخل العنصر الذي يحمل ID="map"
    const map = L.map('map').setView([defaultLat, defaultLng], 13);

    // إضافة طبقة التصاميم المرئية للخرائط (من OpenStreetMap المجانية)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // إضافة علامة (Pin) تفاعلية على الخريطة
    const marker = L.marker([defaultLat, defaultLng]).addTo(map);
    marker.bindPopup("<b>موقعنا هنا!</b><br>هذه نقطة انطلاق التطبيق.").openPopup();

    // إضافة تفاعل عند النقر على أي مكان في الخريطة لإضافة علامة جديدة
    map.on('click', function(e) {
        marker.setLatLng(e.latlng);
        marker.setPopupContent(`تم اختيار الموقع: <br>lat: ${e.latlng.lat.toFixed(4)}, lng: ${e.latlng.lng.toFixed(4)}`).openPopup();
    });
});
