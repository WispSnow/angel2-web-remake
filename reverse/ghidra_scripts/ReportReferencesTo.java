// Reports all references to one or more addresses.
// @category Angel2

import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.symbol.Reference;

public class ReportReferencesTo extends GhidraScript {
    @Override
    protected void run() throws Exception {
        String[] args = getScriptArgs();
        if (args.length == 0) {
            throw new IllegalArgumentException("Expected one or more addresses");
        }
        for (String text : args) {
            Address address = currentProgram.getAddressFactory().getAddress(text);
            int count = 0;
            println("TARGET " + address);
            for (Reference reference : getReferencesTo(address)) {
                Function function = getFunctionContaining(reference.getFromAddress());
                Instruction instruction = getInstructionAt(reference.getFromAddress());
                println("  from=" + reference.getFromAddress() +
                    " type=" + reference.getReferenceType() +
                    " function=" + (function == null ? "<none>" : function.getName()) +
                    " instruction=" + (instruction == null ? "<none>" : instruction));
                count++;
            }
            println("COUNT " + count);
        }
    }
}
