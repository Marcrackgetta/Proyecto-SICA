'use client';

import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';

// Arreglo de iconos por defecto
const icon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

interface Camara {
  id: string;
  nombre: string;
  ubicacion: any;
  activa: boolean;
}

interface MapProps {
  camaras: Camara[];
  selectedCamaraId?: string | null;
  onSelectCamara: (id: string) => void;
}

// Subcomponente para animar el paneo (flyTo) cuando cambia el center
function MapUpdater({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 1.5 });
  }, [center, zoom, map]);
  return null;
}

export default function MapComponent({ camaras, selectedCamaraId, onSelectCamara }: MapProps) {
  // Determinar la cámara seleccionada
  const activeCam = camaras.find(c => c.id === selectedCamaraId);
  
  // Coordenadas neutras por defecto
  let centerPosition: [number, number] = [-2.128963, -79.931081];
  let currentZoom = 15;

  if (activeCam && activeCam.ubicacion) {
    let lat = NaN;
    let lng = NaN;

    if (typeof activeCam.ubicacion === 'object') {
      lat = Number(activeCam.ubicacion.latitude || activeCam.ubicacion.lat);
      lng = Number(activeCam.ubicacion.longitude || activeCam.ubicacion.lng);
    } else if (typeof activeCam.ubicacion === 'string') {
      const parts = activeCam.ubicacion.split(',');
      lat = Number(parts[0]);
      lng = Number(parts[1]);
    }

    if (!isNaN(lat) && !isNaN(lng)) {
      centerPosition = [lat, lng];
      currentZoom = 18;
    }
  }

  // El requerimiento dice:
  // Sin selección -> mapa sin marcadores.
  // Con selección -> solo marcador visible de esa cámara.
  const markerCams = activeCam ? [activeCam] : [];

  return (
    <MapContainer 
      center={centerPosition} 
      zoom={currentZoom} 
      className="w-full h-full rounded-xl z-0 cursor-pointer"
    >
      <MapUpdater center={centerPosition} zoom={currentZoom} />
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap'
      />
      
      {markerCams.map((cam) => {
        if (!cam.ubicacion) return null;

        let lat = NaN;
        let lng = NaN;

        if (typeof cam.ubicacion === 'object') {
          lat = Number(cam.ubicacion.latitude || cam.ubicacion.lat);
          lng = Number(cam.ubicacion.longitude || cam.ubicacion.lng);
        } else if (typeof cam.ubicacion === 'string') {
          const parts = cam.ubicacion.split(',');
          lat = Number(parts[0]);
          lng = Number(parts[1]);
        }

        if (isNaN(lat) || isNaN(lng)) return null;
        
        return (
          <Marker 
            key={cam.id} 
            position={[lat, lng]} 
            icon={icon}
            eventHandlers={{
              click: () => onSelectCamara(cam.id),
            }}
          />
        );
      })}
    </MapContainer>
  );
}