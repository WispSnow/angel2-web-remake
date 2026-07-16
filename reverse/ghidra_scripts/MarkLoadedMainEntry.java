// Marks the entry point of the in-memory ANGEL2 main image dumped from DOSBox-X.
// @category Angel2

import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;

public class MarkLoadedMainEntry extends GhidraScript {
    @Override
    protected void run() throws Exception {
        String[] args = getScriptArgs();
        String entryText = args.length > 0 ? args[0] : "0FB8:0000";
        String label = args.length > 1 ? args[1] : "ANGEL2_MAIN_ENTRY";
        Address entry = currentProgram.getAddressFactory().getAddress(entryText);

        if (entry == null || !currentProgram.getMemory().contains(entry)) {
            throw new IllegalArgumentException("Entry is outside loaded memory: " + entryText);
        }

        createLabel(entry, label, true);
        currentProgram.getSymbolTable().addExternalEntryPoint(entry);

        if (getInstructionAt(entry) == null) {
            disassemble(entry);
        }

        Function function = getFunctionAt(entry);
        if (function == null) {
            function = createFunction(entry, label);
        }

        println(label + " marked at " + entry +
            (function == null ? " (function creation deferred)" : ""));
    }
}
