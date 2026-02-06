#!/usr/bin/env python3
"""
Geotab Fault Categorization Script for Circet Fleet (UK/Ireland)

This script fetches FaultData from the MyGeotab API and categorizes faults into
three distinct buckets based on diagnostic logic optimized for fleet operations:
1. Camera & Hardware Integration (IOX-based systems)
2. Telematics Device Health (GO unit tampering/health)
3. Vehicle Health (Engine/OBD with emphasis on AdBlue/DPF for UK/Ireland compliance)

Performance Optimization:
- Fetches all Diagnostic definitions once at startup
- Builds in-memory lookup map (ID → Diagnostic)
- Processes faults against cached diagnostics (avoids N+1 queries)

Author: Senior Backend Engineer - Telematics Team
Date: 2026-02-05
"""

import logging
import sys
from typing import Dict, List, Optional, Tuple
from datetime import datetime
from collections import defaultdict
import mygeotab

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('fault_categorization.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)


class GeotabFaultCategorizer:
    """
    Categorizes Geotab FaultData into operational buckets for fleet monitoring.
    """
    
    # Geotab Source IDs (constants from API)
    SOURCE_GEOTAB_GO = "SourceGeotabGoId"
    SOURCE_THIRD_PARTY = "SourceThirdPartyId"
    SOURCE_PROPRIETARY = "SourceProprietaryId"
    SOURCE_OBD = "SourceObdId"
    SOURCE_J1939 = "SourceJ1939Id"
    
    # Critical Device Codes
    CODE_DEVICE_UNPLUGGED = 136
    CODE_LOOSE_INSTALL_166 = 166
    CODE_LOOSE_INSTALL_174 = 174
    CODE_POWER_LOSS_130 = 130
    CODE_POWER_LOSS_131 = 131
    CODE_MODEM_FAILURE = 147
    
    # Fault Categories
    CATEGORY_CAMERA_IOX = "Camera_Linked_Hardware"
    CATEGORY_DEVICE_TAMPER = "Device_Tamper_Unplugged"
    CATEGORY_DEVICE_LOOSE = "Device_Loose_Install"
    CATEGORY_DEVICE_POWER = "Device_Power_Loss"
    CATEGORY_DEVICE_MODEM = "Device_Modem_Failure"
    CATEGORY_DEVICE_GENERAL = "Device_General_Health"
    CATEGORY_VEHICLE_EMISSIONS = "Vehicle_Emissions_Critical"
    CATEGORY_VEHICLE_ENGINE = "Vehicle_Engine_Fault"
    CATEGORY_UNKNOWN = "Unknown_Category"
    
    def __init__(self, database: str, username: str, password: str, server: str = "my.geotab.com"):
        """
        Initialize the Geotab API client.
        
        Args:
            database: Geotab database name
            username: Geotab user email
            password: Geotab password
            server: Geotab server URL (default: my.geotab.com)
        """
        self.database = database
        self.username = username
        self.server = server
        self.api = None
        self.diagnostic_lookup: Dict[str, Dict] = {}
        
        try:
            logger.info(f"Connecting to Geotab database: {database}")
            self.api = mygeotab.API(
                username=username,
                password=password,
                database=database,
                server=server
            )
            self.api.authenticate()
            logger.info("Successfully authenticated with Geotab API")
        except Exception as e:
            logger.error(f"Failed to authenticate with Geotab: {e}")
            raise
    
    def build_diagnostic_lookup(self) -> None:
        """
        Fetch all Diagnostic definitions and build an in-memory lookup map.
        
        This is a critical performance optimization - fetching diagnostics once
        prevents N API calls when processing N faults.
        
        Raises:
            Exception: If diagnostic fetch fails
        """
        try:
            logger.info("Fetching all Diagnostic definitions...")
            start_time = datetime.now()
            
            diagnostics = self.api.get("Diagnostic")
            
            # Build lookup map: diagnostic_id -> diagnostic_object
            for diag in diagnostics:
                self.diagnostic_lookup[diag['id']] = {
                    'id': diag['id'],
                    'name': diag.get('name', ''),
                    'code': diag.get('code'),
                    'source': diag.get('source', {}).get('id', ''),
                    'source_name': diag.get('source', {}).get('name', '')
                }
            
            elapsed = (datetime.now() - start_time).total_seconds()
            logger.info(f"Successfully loaded {len(self.diagnostic_lookup)} diagnostics in {elapsed:.2f}s")
            
        except Exception as e:
            logger.error(f"Failed to fetch diagnostics: {e}")
            raise
    
    def categorize_fault(self, fault: Dict) -> Tuple[str, str]:
        """
        Categorize a single fault based on diagnostic logic.
        
        Logic applied in priority order:
        1. Camera/IOX hardware (name-based matching - highest priority)
        2. Device health (GO unit tampering/issues)
        3. Vehicle health (OBD/J1939 engine faults)
        
        Args:
            fault: FaultData object from Geotab API
            
        Returns:
            Tuple of (category, human_readable_label)
        """
        try:
            # Extract diagnostic ID from fault
            diagnostic_id = fault.get('diagnostic', {}).get('id')
            if not diagnostic_id:
                logger.warning(f"Fault missing diagnostic ID: {fault.get('id', 'unknown')}")
                return self.CATEGORY_UNKNOWN, "Missing Diagnostic Reference"
            
            # Lookup diagnostic definition
            diag_def = self.diagnostic_lookup.get(diagnostic_id)
            if not diag_def:
                logger.warning(f"Diagnostic ID not found in lookup: {diagnostic_id}")
                return self.CATEGORY_UNKNOWN, f"Unknown Diagnostic ({diagnostic_id})"
            
            source = diag_def['source']
            name = diag_def['name']
            code = diag_def['code']
            
            # PRIORITY 1: Camera/IOX Hardware Detection
            # NOTE: Cameras may use SourceGeotabGoId, so name matching is critical
            camera_keywords = ['IOX', 'USB', 'Camera', 'Aux', 'AUX']
            if any(keyword.lower() in name.lower() for keyword in camera_keywords):
                return self.CATEGORY_CAMERA_IOX, f"Camera/IOX: {name}"
            
            # Also check for explicit third-party/proprietary sources
            if source in [self.SOURCE_THIRD_PARTY, self.SOURCE_PROPRIETARY]:
                return self.CATEGORY_CAMERA_IOX, f"Third-Party Hardware: {name}"
            
            # PRIORITY 2: Telematics Device Health (GO Unit)
            if source == self.SOURCE_GEOTAB_GO:
                if code == self.CODE_DEVICE_UNPLUGGED:
                    return self.CATEGORY_DEVICE_TAMPER, f"CRITICAL: Device Unplugged/Tampered (Code {code})"
                
                if code in [self.CODE_LOOSE_INSTALL_166, self.CODE_LOOSE_INSTALL_174]:
                    return self.CATEGORY_DEVICE_LOOSE, f"Installation Issue: Loose Device (Code {code})"
                
                if code in [self.CODE_POWER_LOSS_130, self.CODE_POWER_LOSS_131]:
                    return self.CATEGORY_DEVICE_POWER, f"Device Power Loss/Reboot (Code {code})"
                
                if code == self.CODE_MODEM_FAILURE:
                    return self.CATEGORY_DEVICE_MODEM, f"Modem/Network Failure (Code {code})"
                
                # General device health issue
                return self.CATEGORY_DEVICE_GENERAL, f"Device Health: {name} (Code {code})"
            
            # PRIORITY 3: Vehicle Health (Engine/OBD)
            if source in [self.SOURCE_OBD, self.SOURCE_J1939]:
                # Critical emissions faults (AdBlue/DPF) - UK/Ireland compliance priority
                emissions_keywords = ['AdBlue', 'Reductant', 'DPF', 'Particulate', 'DEF', 'SCR']
                if any(keyword.lower() in name.lower() for keyword in emissions_keywords):
                    return self.CATEGORY_VEHICLE_EMISSIONS, f"CRITICAL EMISSIONS: {name}"
                
                # General engine fault
                return self.CATEGORY_VEHICLE_ENGINE, f"Engine Fault: {name} (Code {code})"
            
            # Fallback for unclassified faults
            return self.CATEGORY_UNKNOWN, f"Unclassified: {name} (Source: {source})"
            
        except Exception as e:
            logger.error(f"Error categorizing fault: {e}")
            return self.CATEGORY_UNKNOWN, f"Categorization Error: {str(e)}"
    
    def fetch_and_categorize_faults(
        self, 
        from_date: Optional[datetime] = None,
        device_ids: Optional[List[str]] = None
    ) -> Dict[str, List[Dict]]:
        """
        Fetch faults from Geotab and categorize them into buckets.
        
        Args:
            from_date: Optional datetime to fetch faults from (default: last 24 hours)
            device_ids: Optional list of device IDs to filter (default: all devices)
            
        Returns:
            Dictionary mapping category -> list of categorized faults
        """
        if not self.diagnostic_lookup:
            logger.warning("Diagnostic lookup not built. Building now...")
            self.build_diagnostic_lookup()
        
        try:
            logger.info("Fetching FaultData from Geotab...")
            start_time = datetime.now()
            
            # Build search criteria
            search = {}
            if from_date:
                search['fromDate'] = from_date.isoformat()
            if device_ids:
                search['deviceSearch'] = {'id': device_ids}
            
            # Fetch all faults
            faults = self.api.get("FaultData", search=search if search else None)
            
            elapsed = (datetime.now() - start_time).total_seconds()
            logger.info(f"Fetched {len(faults)} faults in {elapsed:.2f}s")
            
            # Categorize faults
            categorized = defaultdict(list)
            logger.info("Categorizing faults...")
            
            for fault in faults:
                category, label = self.categorize_fault(fault)
                
                categorized[category].append({
                    'fault_id': fault.get('id'),
                    'device_id': fault.get('device', {}).get('id'),
                    'device_name': fault.get('device', {}).get('name'),
                    'timestamp': fault.get('dateTime'),
                    'diagnostic_id': fault.get('diagnostic', {}).get('id'),
                    'category': category,
                    'label': label,
                    'active_from': fault.get('activeFrom'),
                    'active_to': fault.get('activeTo'),
                    'is_active': fault.get('activeTo') is None
                })
            
            # Log summary
            logger.info("=" * 60)
            logger.info("FAULT CATEGORIZATION SUMMARY")
            logger.info("=" * 60)
            for category in sorted(categorized.keys()):
                count = len(categorized[category])
                logger.info(f"{category}: {count} faults")
            logger.info("=" * 60)
            
            return dict(categorized)
            
        except Exception as e:
            logger.error(f"Failed to fetch/categorize faults: {e}")
            raise
    
    def print_detailed_report(self, categorized_faults: Dict[str, List[Dict]]) -> None:
        """
        Print a detailed report of categorized faults.
        
        Args:
            categorized_faults: Dictionary from fetch_and_categorize_faults()
        """
        print("\n" + "=" * 80)
        print("GEOTAB FAULT CATEGORIZATION REPORT - CIRCET FLEET (UK/IRELAND)")
        print("=" * 80)
        print(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"Total Faults: {sum(len(v) for v in categorized_faults.values())}")
        print("=" * 80 + "\n")
        
        priority_order = [
            (self.CATEGORY_DEVICE_TAMPER, "🚨 CRITICAL: Device Tampering"),
            (self.CATEGORY_VEHICLE_EMISSIONS, "⚠️  CRITICAL: Emissions (AdBlue/DPF)"),
            (self.CATEGORY_CAMERA_IOX, "📹 Camera/IOX Hardware"),
            (self.CATEGORY_DEVICE_LOOSE, "🔧 Device Installation Issues"),
            (self.CATEGORY_DEVICE_POWER, "🔋 Device Power Issues"),
            (self.CATEGORY_DEVICE_MODEM, "📡 Device Network/Modem"),
            (self.CATEGORY_DEVICE_GENERAL, "🔹 Device General Health"),
            (self.CATEGORY_VEHICLE_ENGINE, "🚗 Vehicle Engine Faults"),
            (self.CATEGORY_UNKNOWN, "❓ Uncategorized"),
        ]
        
        for category, header in priority_order:
            if category not in categorized_faults:
                continue
            
            faults = categorized_faults[category]
            print(f"\n{header}")
            print(f"Count: {len(faults)}")
            print("-" * 80)
            
            # Show first 5 examples
            for fault in faults[:5]:
                status = "🔴 ACTIVE" if fault['is_active'] else "✅ Cleared"
                print(f"  {status} | {fault['device_name']} | {fault['label']}")
                print(f"           Timestamp: {fault['timestamp']}")
            
            if len(faults) > 5:
                print(f"  ... and {len(faults) - 5} more")
            print()


def main():
    """
    Main execution function.
    
    CONFIGURATION:
    Update these values with your Geotab credentials.
    For production, use environment variables or a secure config file.
    """
    # Geotab Credentials (REPLACE WITH YOUR VALUES)
    DATABASE = "your_database_name"
    USERNAME = "your_email@company.com"
    PASSWORD = "your_password"
    SERVER = "my.geotab.com"  # or your specific server
    
    # Validate configuration
    if DATABASE == "your_database_name":
        logger.error("Please update the Geotab credentials in the script before running.")
        print("\n⚠️  Configuration Required:")
        print("Please edit the script and update DATABASE, USERNAME, PASSWORD with your Geotab credentials.")
        sys.exit(1)
    
    try:
        # Initialize categorizer
        categorizer = GeotabFaultCategorizer(
            database=DATABASE,
            username=USERNAME,
            password=PASSWORD,
            server=SERVER
        )
        
        # Build diagnostic lookup (performance optimization)
        categorizer.build_diagnostic_lookup()
        
        # Fetch and categorize faults
        # Optional: Add from_date parameter to limit time range
        # from datetime import timedelta
        # from_date = datetime.now() - timedelta(days=7)
        categorized_faults = categorizer.fetch_and_categorize_faults()
        
        # Print detailed report
        categorizer.print_detailed_report(categorized_faults)
        
        # Optional: Export to JSON/CSV for further processing
        # import json
        # with open('fault_report.json', 'w') as f:
        #     json.dump(categorized_faults, f, indent=2, default=str)
        
        logger.info("Fault categorization completed successfully")
        
    except KeyboardInterrupt:
        logger.info("Process interrupted by user")
        sys.exit(0)
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
