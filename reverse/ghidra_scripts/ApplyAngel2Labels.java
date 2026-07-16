// Applies confirmed semantic names from static and DOSBox-X runtime analysis.
// @category Angel2

import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.CodeUnit;
import ghidra.program.model.listing.Function;
import ghidra.program.model.symbol.SourceType;
import ghidra.program.model.symbol.Symbol;
import ghidra.program.model.symbol.SymbolTable;

public class ApplyAngel2Labels extends GhidraScript {
    private void renameFunction(String addressText, String name, String comment)
            throws Exception {
        Address address = currentProgram.getAddressFactory().getAddress(addressText);
        if (address == null || !currentProgram.getMemory().contains(address)) {
            throw new IllegalArgumentException("Address is outside memory: " + addressText);
        }

        Function function = getFunctionAt(address);
        if (function == null) {
            disassemble(address);
            function = createFunction(address, name);
        }
        if (function == null) {
            throw new IllegalStateException("Could not create function at " + addressText);
        }

        function.setName(name, SourceType.USER_DEFINED);
        currentProgram.getListing().setComment(
            address, CodeUnit.PLATE_COMMENT, comment);
        println("Function " + address + " -> " + name);
    }

    private void labelData(String addressText, String name, String comment)
            throws Exception {
        Address address = currentProgram.getAddressFactory().getAddress(addressText);
        if (address == null || !currentProgram.getMemory().contains(address)) {
            throw new IllegalArgumentException("Address is outside memory: " + addressText);
        }

        SymbolTable symbols = currentProgram.getSymbolTable();
        Symbol namedSymbol = null;
        for (Symbol symbol : symbols.getSymbols(address)) {
            if (name.equals(symbol.getName())) {
                namedSymbol = symbol;
                break;
            }
        }
        if (namedSymbol == null) {
            namedSymbol = symbols.createLabel(address, name, SourceType.USER_DEFINED);
        }
        namedSymbol.setPrimary();
        currentProgram.getListing().setComment(
            address, CodeUnit.PLATE_COMMENT, comment);
        println("Data " + address + " -> " + name);
    }

    private void removeStaleLabel(String addressText, String name) {
        Address address = currentProgram.getAddressFactory().getAddress(addressText);
        if (address == null) {
            return;
        }
        for (Symbol symbol : currentProgram.getSymbolTable().getSymbols(address)) {
            if (name.equals(symbol.getName())) {
                symbol.delete();
                println("Removed stale label " + name + " from " + address);
            }
        }
    }

    private void applyGoLabels() throws Exception {
        renameFunction("1000:0079", "MUS_SET",
            "Original TLINK symbol. Probe INT 33h mouse services and set MOUSE_USE to Y or N.");
        renameFunction("1000:019C", "LOAD_V",
            "Original TLINK symbol. Load the selected runtime module and pass it through unpack, relocation, and execution.");
        renameFunction("1000:01E8", "OVER",
            "Original TLINK symbol for the runtime-module relocation pass.");
        renameFunction("1000:0211", "UPK",
            "Original TLINK symbol for unpacking a selected runtime module.");
        renameFunction("1000:0270", "G_ARJ",
            "Original TLINK symbol for the wrapper around the ARJ-style decompressor.");
        renameFunction("1000:028B", "RUNTO",
            "Original TLINK symbol for transferring control to the recovered runtime module.");
        renameFunction("1000:02F2", "RUN_EXE1",
            "Original TLINK symbol for one load/unpack/relocate/run state-machine cycle.");
        renameFunction("1000:0616", "READ_SWF",
            "Original public TLINK symbol for the loader's indexed SWF read interface.");
        renameFunction("1000:07B7", "CACHE_STARTUP_SWFS",
            "Original symbol ALL_READ_EMS. Iterate the startup SWF table and cache each file in EMS.");
        renameFunction("1000:0806", "CACHE_ONE_SWF_TO_EMS",
            "Allocate EMS pages for one SWF and copy it in 16 KiB chunks.");
        renameFunction("1000:0878", "GET_FILE_SIZE_AND_EMS_PAGE_COUNT",
            "Open the current SWF, seek to EOF, and compute required 16 KiB EMS pages.");
        renameFunction("1000:08DA", "OPEN_CURRENT_SWF",
            "Open the filename stored at CS:0876 read-only with DOS INT 21h AX=3D00h.");
        renameFunction("1000:08EE", "CLOSE_CURRENT_SWF",
            "Close the current DOS file handle.");
        renameFunction("1000:08F8", "MAP_EMS_PAGE",
            "Map one logical EMS page into the page frame with INT 67h AH=44h.");
        renameFunction("1000:0917", "READ_16K_FILE_CHUNK",
            "Read up to 4000h bytes from the current SWF with DOS INT 21h AH=3Fh.");
        renameFunction("1000:092D", "COPY_16K_TO_EMS_WINDOW",
            "Copy the 16 KiB file buffer into the mapped EMS page frame.");
        renameFunction("1000:094A", "READ_SWF_RECORD",
            "Dispatch one indexed SWF record read to the EMS cache or disk fallback.");
        renameFunction("1000:09B7", "READ_SWF_RECORD_FROM_EMS",
            "Read one indexed SWF record from the cached EMS image.");
        renameFunction("1000:0A60", "READ_SWF_RECORD_FROM_DISK",
            "Read one indexed SWF record through the on-disk fallback path.");
        renameFunction("1000:0A87", "OPEN_SWF_FOR_RECORD_READ",
            "Open the selected SWF read-only for an indexed record read.");
        renameFunction("1000:0A9B", "READ_SWF_INDEX_ENTRY",
            "Seek to recordIndex*6 and read the uint32 offset plus uint16 length descriptor.");
        renameFunction("1000:0AF2", "READ_SWF_RECORD_PAYLOAD",
            "Seek to a descriptor's uint32 offset and read its uint16 payload length.");
        renameFunction("1000:0B33", "FREE_SWF_EMS_HANDLES",
            "Release the EMS handles stored in the startup SWF entries.");

        removeStaleLabel("146A:0264", "STARTUP_SWF_CACHE_ENTRY_A");
        labelData("146A:0244", "SWF_ENTRY_POINTER_TABLE",
            "Pointers to records containing an EMS handle followed by a DOS filename.");
        labelData("146A:0040", "JUST_DAT",
            "Original TLINK symbol; loader state related to the JUST data path, exact semantics unresolved.");
        labelData("146A:0042", "FM_DATA",
            "Original TLINK symbol for the loader's FM-data state word.");
        labelData("146A:004A", "WK_EXE",
            "Original TLINK symbol selecting the runtime module/state to execute.");
        labelData("146A:005A", "CONTINU",
            "Original TLINK symbol: N starts a new campaign path; ASCII 0 through 4 selects WAR0.TST through WAR4.TST for continue.");
        labelData("146A:0064", "LV_HARD",
            "Original TLINK difficulty value: 0=過關斬將, 1=勢均力敵, 2=困難重重, 3=無法無天.");
        labelData("146A:0066", "SAVE_NUM",
            "Original TLINK symbol for a save-number state word.");
        labelData("146A:0068", "MIMA_NUM",
            "Original TLINK symbol for a password-number word; initial zero and not consumed by the closed module29-to-21 gate handoff.");
        labelData("146A:006A", "KILL_ALL",
            "Original TLINK symbol; likely all-enemies-defeated state, behavior still requires access tracing.");
        labelData("146A:0100", "MOUSE_USE",
            "Original TLINK symbol for mouse-use state.");
        labelData("146A:0312", "MIMA_PASS",
            "Original TLINK password-gate state: word 0 is the process gate count and word 1 saves the intended next module.");
        labelData("146A:0326", "WORK_EXE",
            "Original TLINK symbol for the runtime-module work buffer.");
        labelData("146A:0262", "STARTUP_SWF_CACHE_ENTRY_A",
            "First startup resource record: EMS handle word followed by the string A.SWF.");
        labelData("146A:0264", "A_SWF_FILENAME",
            "NUL-terminated filename A.SWF; the DOS open path receives this address.");
        labelData("146A:0252", "SWF_POINTER_SAY_INDEX_7",
            "Resource pointer-table slot 7, selecting the SAY.SWF cache entry.");
        labelData("146A:02B9", "STARTUP_SWF_CACHE_ENTRY_SAY",
            "SAY.SWF EMS handle word followed by its NUL-terminated filename.");
        labelData("146A:02BB", "SAY_SWF_FILENAME",
            "NUL-terminated filename SAY.SWF.");
        labelData("146A:0256", "SWF_POINTER_NUM_INDEX_9",
            "Resource pointer-table slot 9, selecting the NUM.SWF cache entry.");
        labelData("146A:02D5", "STARTUP_SWF_CACHE_ENTRY_NUM",
            "NUM.SWF EMS handle word followed by its NUL-terminated filename.");
        labelData("146A:02D7", "NUM_SWF_FILENAME",
            "NUL-terminated filename NUM.SWF.");
        labelData("146A:0258", "SWF_POINTER_CHA_INDEX_10",
            "Resource pointer-table slot 10, selecting the CHA.SWF cache entry.");
        labelData("146A:02E2", "STARTUP_SWF_CACHE_ENTRY_CHA",
            "CHA.SWF EMS handle word followed by its NUL-terminated filename.");
        labelData("146A:02E4", "CHA_SWF_FILENAME",
            "NUL-terminated filename CHA.SWF.");
        labelData("146A:0807", "SWF_ENTRY_POINTER_TABLE_OFFSET",
            "Runtime word containing the offset of SWF_ENTRY_POINTER_TABLE.");
    }

    private void applyMainModuleLabels() throws Exception {
        renameFunction("0000:0D56", "LOAD_SET_TXT_CONFIG",
            "Load SET.TXT into a work segment and decode its startup configuration fields.");
        renameFunction("0000:29C4", "READ_WHOLE_FILE",
            "Open DS:DX, read up to FFFFh bytes into AX:BX, close, and return DX='Y'/'N'.");
        renameFunction("0000:3A0E", "READ_INDEXED_RESOURCE_FAR",
            "Far-call wrapper for the main program's indexed-resource reader.");
        renameFunction("0000:3A12", "READ_INDEXED_RESOURCE",
            "Read resource BX, record CX to ES:DI through the EMS cache or disk fallback.");
        renameFunction("0000:3A52", "READ_EMS_INDEX_DESCRIPTOR",
            "Read the six-byte offset/length descriptor for the selected EMS record.");
        renameFunction("0000:3A7F", "READ_INDEXED_RESOURCE_FROM_EMS",
            "Map the cached resource and copy the selected record to its destination.");
        renameFunction("0000:3AC8", "COPY_EMS_PAYLOAD",
            "Copy an EMS-backed payload while handling 16 KiB page crossings.");
        renameFunction("0000:3AD6", "ADVANCE_EMS_PAYLOAD_PAGE",
            "Advance and remap after an EMS payload crosses a page boundary.");
        renameFunction("0000:3AE8", "MAP_FOUR_EMS_PAGES",
            "Map four consecutive logical EMS pages with INT 67h AH=44h.");
        renameFunction("0000:3B02", "MAP_EMS_PAYLOAD_WINDOW",
            "Map the EMS page containing the high word of the record offset.");
        renameFunction("0000:3B28", "READ_INDEXED_RESOURCE_FROM_DISK",
            "Disk fallback for one indexed-resource record.");
        renameFunction("0000:3B4F", "OPEN_INDEXED_RESOURCE",
            "Open the selected resource filename read-only.");
        renameFunction("0000:3B63", "READ_DISK_INDEX_DESCRIPTOR",
            "Seek to recordIndex*6 and read its six-byte descriptor from disk.");
        renameFunction("0000:3BBA", "READ_DISK_RECORD_PAYLOAD",
            "Seek to the descriptor offset and read the selected payload from disk.");
        renameFunction("0000:3C70", "SCAN_WAR_SAVE_SLOTS",
            "Scan WAR0.TST through WAR4.TST, preloading five metadata words for each numbered save slot.");
        renameFunction("0000:3C9C", "STORE_WAR_SAVE_SLOT_METADATA",
            "Copy words at TST header offsets 12h, 14h, 16h, 18h, and 1Eh into five slot arrays; use XX when absent.");
        renameFunction("0000:3CE2", "READ_WAR_SAVE_SLOT_HEADER",
            "Open the current WARn.TST read-only and read its first 32h bytes into the save work segment.");
        labelData("0000:9DCC", "SET_TXT_FILENAME",
            "NUL-terminated filename SET.TXT; addressed as DS:04ACh at runtime.");
        labelData("0000:EB9F", "RESOURCE_POINTER_TABLE_OFFSET_INITIAL",
            "Initial DS:527F word is 5287h in the captured pre-initialization image; entry code replaces it with 0120h.");
        labelData("0000:9A40", "MAIN_RESOURCE_POINTER_TABLE",
            "Active resource pointer table at DS:0120 after ANGEL2_MODULE_ENTRY initializes DS:527F.");
        labelData("0000:9A5E", "MAIN_RESOURCE_ENTRY_A",
            "First active resource entry: EMS handle followed by filename A.SWF.");
        labelData("0000:9A4E", "MAIN_RESOURCE_POINTER_SAY_INDEX_7",
            "Pointer-table slot 7 selecting the SAY.SWF entry.");
        labelData("0000:9AB5", "MAIN_RESOURCE_ENTRY_SAY",
            "SAY.SWF EMS handle followed by its NUL-terminated filename.");
        labelData("0000:9A52", "MAIN_RESOURCE_POINTER_NUM_INDEX_9",
            "Pointer-table slot 9 selecting the NUM.SWF entry.");
        labelData("0000:9AD1", "MAIN_RESOURCE_ENTRY_NUM",
            "NUM.SWF EMS handle followed by its NUL-terminated filename.");
        labelData("0000:9A54", "MAIN_RESOURCE_POINTER_CHA_INDEX_10",
            "Pointer-table slot 10 selecting the CHA.SWF entry.");
        labelData("0000:9ADE", "MAIN_RESOURCE_ENTRY_CHA",
            "CHA.SWF EMS handle followed by its NUL-terminated filename.");
        labelData("0000:A45E", "WAR_SAVE_FILENAME",
            "Mutable NUL-terminated WAR0.TST name; SCAN_WAR_SAVE_SLOTS increments the digit through slot 4.");
        labelData("0000:A469", "WAR_SAVE_METADATA_FIELD0",
            "Five-word array populated from TST header offset 12h, one word per numbered save slot.");
        labelData("0000:A473", "WAR_SAVE_METADATA_FIELD1",
            "Five-word array populated from TST header offset 14h, one word per numbered save slot.");
        labelData("0000:A47D", "WAR_SAVE_METADATA_FIELD2",
            "Five-word array populated from TST header offset 16h, one word per numbered save slot.");
        labelData("0000:A487", "WAR_SAVE_METADATA_FIELD3",
            "Five-word array populated from TST header offset 18h, one word per numbered save slot.");
        labelData("0000:A491", "WAR_SAVE_METADATA_FIELD4",
            "Five-word array populated from TST header offset 1Eh, one word per numbered save slot.");
    }

    @Override
    protected void run() throws Exception {
        String programName = currentProgram.getName();
        if ("GO.EXE".equalsIgnoreCase(programName)) {
            applyGoLabels();
        }
        else if ("angel2-main-module-offset.bin".equals(programName)) {
            applyMainModuleLabels();
        }
        else {
            throw new IllegalArgumentException(
                "ApplyAngel2Labels does not support program: " + programName);
        }
        println("Applied confirmed ANGEL2 labels to " + programName);
    }
}
